/**
 * `sdlc task resolve <arg>` — deterministic task-file resolution.
 *
 * The op-substrate home of the procedure specified in
 * `solutions/ontological/lib/model/entities/task/file-resolution.md` ([[P-0001]] /
 * [[D-0007-deterministic-op-substrate]] §2a): every skill that takes a
 * `<slug-or-filename>` / `<absolute-path>` argument resolves it by ONE
 * deterministic rule instead of re-implementing the prose. The handler is
 * PURE — no LLM, no shell — so the same arg always resolves the same way.
 *
 * Resolution order (reproduced exactly from that doc):
 *   1. Absolute path — use directly. Missing → NO TASK FOUND.
 *   2. Exact filename match in `docs/planning/tasks/`, with or without a
 *      trailing `.md`.
 *   3. Glob match against `docs/planning/tasks/<arg>*.md` then
 *      `docs/planning/tasks/*<arg>*.md`. Exactly one → use it; multiple →
 *      ambiguous (the spec's non-interactive policy: AMBIGUOUS marker).
 *   4. No match → NO TASK FOUND.
 *
 * After resolution the op captures the absolute `path` and the `basename`
 * (filename without `.md`).
 *
 * Terminal markers + exit codes (emitted by the `cli.render` hook, mirroring
 * `task next`'s cycle marker — the handler itself never throws for a normal
 * not-found / ambiguous outcome):
 *   - resolved        → the absolute path on stdout, exit 0.
 *   - not-found       → `NO TASK FOUND for "<arg>"` on stderr, exit 1.
 *   - ambiguous       → `AMBIGUOUS: <comma-separated candidate filenames>` on
 *                       stderr, exit 1. Interactive disambiguation, when a
 *                       caller wants it, reads the structured `candidates`.
 *
 * The "glob" here matches the arg as a LITERAL prefix / substring of the
 * basename (not a shell/glob pattern), so a slug containing glob
 * metacharacters resolves by its plain text — the faithful reading of the
 * `<arg>*.md` / `*<arg>*.md` forms.
 */

import { readdirSync } from 'node:fs'
import { basename as pathBasename, isAbsolute, join } from 'node:path'

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import { isFile } from '@lib/util/fs'

// ---------------------------------------------------------------------------
// Terminal markers — verbatim from file-resolution.md. Exported so callers
// (and the test suite) assert against the single source of truth.
// ---------------------------------------------------------------------------

/** Prefix of the no-match / missing-absolute-path marker. */
export const NO_TASK_FOUND_PREFIX = 'NO TASK FOUND for '

/** The full `NO TASK FOUND for "<arg>"` marker for a given arg. */
export function noTaskFoundMarker(arg: string): string {
  return `${NO_TASK_FOUND_PREFIX}"${arg}"`
}

/** Prefix of the non-interactive ambiguity marker. */
export const AMBIGUOUS_MARKER_PREFIX = 'AMBIGUOUS: '

/** The full `AMBIGUOUS: <comma-separated candidate filenames>` marker. */
export function ambiguousMarker(candidates: string[]): string {
  return `${AMBIGUOUS_MARKER_PREFIX}${candidates.join(',')}`
}

const TASKS_SUBPATH = ['docs', 'planning', 'tasks'] as const
const MD_EXT = '.md'

/** List the `.md` filenames in the tasks dir, sorted; [] when the dir is absent. */
function listTaskFiles(tasksDir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(tasksDir)
  } catch {
    return []
  }
  return entries.filter((e) => e.endsWith(MD_EXT)).sort()
}

// ---------------------------------------------------------------------------
// Pure resolution core (no ctx, no I/O beyond fs reads) — the testable unit.
// ---------------------------------------------------------------------------

type ResolveReason = 'absolute' | 'exact' | 'glob' | 'ambiguous' | 'not-found'

interface ResolveResult {
  arg: string
  resolved: boolean
  reason: ResolveReason
  path: string | null
  basename: string | null
  candidates: string[]
}

function found(arg: string, reason: ResolveReason, absPath: string): ResolveResult {
  return {
    arg,
    resolved: true,
    reason,
    path: absPath,
    basename: pathBasename(absPath, MD_EXT),
    candidates: [],
  }
}

function notFound(arg: string): ResolveResult {
  return { arg, resolved: false, reason: 'not-found', path: null, basename: null, candidates: [] }
}

function ambiguous(arg: string, candidates: string[]): ResolveResult {
  return { arg, resolved: false, reason: 'ambiguous', path: null, basename: null, candidates }
}

/**
 * Resolve `arg` against `<projectRoot>/docs/planning/tasks/` per
 * file-resolution.md. Pure: only fs reads, never throws for a normal
 * not-found / ambiguous outcome.
 */
export function resolveTaskFile(projectRoot: string, arg: string): ResolveResult {
  // 1. Absolute path — use directly; missing → not found.
  if (isAbsolute(arg)) {
    return isFile(arg) ? found(arg, 'absolute', arg) : notFound(arg)
  }

  const tasksDir = join(projectRoot, ...TASKS_SUBPATH)

  // 2. Exact filename match, with or without a trailing `.md`.
  const argBase = arg.endsWith(MD_EXT) ? arg.slice(0, -MD_EXT.length) : arg
  const exactPath = join(tasksDir, `${argBase}${MD_EXT}`)
  if (isFile(exactPath)) {
    return found(arg, 'exact', exactPath)
  }

  // 3. Glob match: `<arg>*.md` then `*<arg>*.md`. The arg is a literal
  //    prefix / substring of the basename (the `.md`-stripped filename).
  const files = listTaskFiles(tasksDir)
  const stems = files.map((f) => f.slice(0, -MD_EXT.length))

  const prefixHits = files.filter((_, i) => stems[i]!.startsWith(argBase))
  if (prefixHits.length === 1) {
    return found(arg, 'glob', join(tasksDir, prefixHits[0]!))
  }
  if (prefixHits.length > 1) {
    return ambiguous(arg, prefixHits)
  }

  const substringHits = files.filter((_, i) => stems[i]!.includes(argBase))
  if (substringHits.length === 1) {
    return found(arg, 'glob', join(tasksDir, substringHits[0]!))
  }
  if (substringHits.length > 1) {
    return ambiguous(arg, substringHits)
  }

  // 4. No match.
  return notFound(arg)
}

// ---------------------------------------------------------------------------
// Op descriptor
// ---------------------------------------------------------------------------

const input = z.object({
  projectRoot: z.string(),
  /** The argument naming a task: absolute path, filename, or slug. */
  arg: z.string(),
})

const reason = z.enum(['absolute', 'exact', 'glob', 'ambiguous', 'not-found'])

const output = z.object({
  /** Echo of the input arg (so the marker text can be reproduced downstream). */
  arg: z.string(),
  /** True iff a single task file was resolved. */
  resolved: z.boolean(),
  /** Which rule resolved (or failed to resolve) the arg. */
  reason,
  /** Absolute path to the resolved task file, or null. */
  path: z.string().nullable(),
  /** Resolved filename without `.md`, or null. */
  basename: z.string().nullable(),
  /**
   * Matching filenames (with `.md`) when `reason === "ambiguous"`, sorted;
   * empty otherwise. A caller wanting interactive disambiguation reads this.
   */
  candidates: z.array(z.string()),
})

export default defineOp({
  path: ['task', 'resolve'],
  summary:
    'Resolve an arg naming a task (absolute path / filename / slug) to its task file (deterministic, per file-resolution.md).',
  input,
  output,
  cli: {
    positionals: ['arg'],
    render: (out, io) => {
      if (out.resolved) {
        io.stdout(`${out.path}\n`)
        return 0
      }
      if (out.reason === 'ambiguous') {
        io.stderr(`${ambiguousMarker(out.candidates)}\n`)
        return 1
      }
      io.stderr(`${noTaskFoundMarker(out.arg)}\n`)
      return 1
    },
  },
  handler: (args, ctx) => {
    // The registry adapter injects `--project-root` into `args.projectRoot`;
    // fall back to the ctx root for direct invokeOp callers.
    const projectRoot = args.projectRoot !== '' ? args.projectRoot : ctx.projectRoot
    return resolveTaskFile(projectRoot, args.arg)
  },
})
