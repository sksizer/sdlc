/**
 * `sdlc standard supersede <standard> --by <new-id>` — mark a standard as
 * superseded by a successor: set `status: closed/superseded` and
 * `superseded_by: [[<new-id>]]` on the OLD standard, schema-validated before
 * anything is written.
 *
 * A distinct verb (not a `standard update --set` shape) because supersession
 * is a fixed two-field transition with its own contract: it always sets the
 * same `status`, always points `superseded_by:` at the successor, and is the
 * surface /sdlc:standard-new wires its supersession flow into
 * ([[D-0007-deterministic-op-substrate]] §2a, Cluster 6). It shares the
 * entity-agnostic frontmatter-set engine in `model/ops/_update.ts` with the
 * `update` ops — only the field set is fixed here.
 *
 * Carry-edges:
 *   - `--by` accepts a bare id (`S-0005`) OR an already-wrapped wikilink
 *     (`[[S-0005]]` / `[[S-0005-slug]]`); the op wraps the bare form. The
 *     schema gate (the standard schema's `superseded_by` pattern + the
 *     `closed/superseded → superseded_by` conditional) is the final arbiter,
 *     so a malformed successor is rejected before any write.
 *   - **No-op gracefully on a missing predecessor**: if `<standard>` does not
 *     resolve to an existing file, the op returns `{superseded:false, wrote:
 *     false}` cleanly (exit 0) rather than failing — the supersession is a
 *     best-effort transition the skill may attempt on a predecessor that was
 *     never created.
 *   - **Idempotent**: a standard already `closed/superseded` by the same
 *     successor is a no-op (`changed:[]`, `wrote:false`, `superseded:true`) —
 *     the shared engine's value-diff path makes re-running safe.
 */

import { join } from 'node:path'

import { z } from 'zod'

import { OpError, defineOp } from '@lib/registry'
import { entityFromDir, type Entity } from '@lib/model/entity'
import { pluginLibDir } from '@lib/util/plugin-root'
import {
  applyFrontmatterUpdates,
  resolveInstanceDocPath,
  readInstanceDoc,
} from '@lib/model/ops/_update'
import { isWikilink, wrapWikilink } from '@lib/util/wikilinks'
import { isCanonicalId } from '@lib/model/identifier'
import { existsSync } from 'node:fs'

const input = z.object({
  projectRoot: z.string(),
  /** Standard-file path (absolute or project-relative) or bare basename — the OLD standard. */
  standard: z.string(),
  /** Successor standard id (bare `S-NNNN[-slug]`) or already-wrapped wikilink. */
  by: z.string(),
})

const output = z.object({
  /** Absolute path of the (old) standard document. */
  path: z.string(),
  /** Keys that were set, sorted. Empty when already superseded or missing. */
  changed: z.array(z.string()),
  /** False under `--dry-run`, a no-op, or a missing predecessor. */
  wrote: z.boolean(),
  /**
   * True when the predecessor exists and is (now) superseded by `--by`;
   * false when the predecessor file did not resolve (graceful no-op).
   */
  superseded: z.boolean(),
})

let standardEntity: Entity | null = null
function getStandardEntity(): Entity {
  // The standard entity dir under the surface root — resolved lazily so it
  // points at the extracted cache under a compiled binary ([[D-0014]]).
  standardEntity ??= entityFromDir(join(pluginLibDir(), 'model', 'entities', 'standard'))
  return standardEntity
}

/** Normalize `--by` into a `[[...]]` wikilink, validating the bare-id shape. */
function successorWikilink(by: string): string {
  if (isWikilink(by)) return by
  if (!isCanonicalId(by)) {
    throw new OpError(
      'INVALID_INPUT',
      `--by must be a canonical id (e.g. S-0005) or a wikilink; got ${JSON.stringify(by)}`,
    )
  }
  return wrapWikilink(by)
}

export default defineOp({
  noun: 'standard',
  verb: 'supersede',
  summary: 'Mark a standard closed/superseded, pointing superseded_by at a successor.',
  input,
  output,
  cli: {
    positionals: ['standard'],
    flags: {
      by: { valueName: 'id', help: 'Successor standard id (S-NNNN) or wikilink.' },
    },
  },
  handler: (args, ctx) => {
    const supersededBy = successorWikilink(args.by)

    // Graceful no-op on a missing predecessor: resolve the path WITHOUT the
    // read's INVALID_INPUT throw, so a never-created predecessor exits clean.
    const resolvedPath = resolveInstanceDocPath('standard', args.projectRoot, args.standard)
    if (!existsSync(resolvedPath)) {
      ctx.io.stderr(
        `standard supersede: predecessor not found at ${resolvedPath}; nothing to supersede\n`,
      )
      return { path: resolvedPath, changed: [], wrote: false, superseded: false }
    }

    const { path, text } = readInstanceDoc('standard', args.projectRoot, args.standard)
    const result = applyFrontmatterUpdates({
      entity: getStandardEntity(),
      path,
      text,
      updates: { status: 'closed/superseded', superseded_by: supersededBy },
      ctx,
    })
    return { ...result, superseded: true }
  },
})
