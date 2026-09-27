/**
 * `sdlc task lint-state-origin` — enforce the task-state-on-main convention.
 *
 * The lint core lives beside this op at `_lint_state_origin_core.ts`
 * ([[D-0007-deterministic-op-substrate]] §2a); the op imports `lint` /
 * `LintError` from it. The lefthook pre-commit gate invokes this verb.
 *
 * Per
 * [[2026-05-28-task-state-frontmatter-commits-on-main-not-worktree-branch]],
 * changes to a task file's task-state frontmatter fields (`status:`,
 * `readiness_verified_at:`, `last_reviewed:`, `definition_gap:`,
 * `completion_note:`, `prs:`) must commit on `main` — never on a
 * `task/<basename>` branch.
 *
 * Render hook: emits violation lines and a summary; returns 1 when
 * violations are found (non-zero shapes the exit code red through lefthook).
 *
 * Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2): absent from
 * default `--help`, revealed by `--advanced`.
 */

import { z } from 'zod'

import { defineOp, type OpIo } from '@lib/registry'
import { lint, LintError } from './_lint_state_origin_core.ts'
import { realResolve } from '@lib/util/paths'

// ---------------------------------------------------------------------------
// Output schema + render hook
// ---------------------------------------------------------------------------

const output = z.object({
  totalViolations: z.number().int(),
  okBranches: z.array(z.string()),
  violationLines: z.array(z.string()),
})

type Output = z.infer<typeof output>

function renderLintStateOrigin(out: Output, io: OpIo): number {
  for (const branch of out.okBranches) {
    io.stdout(`OK    ${branch}\n`)
  }
  if (out.violationLines.length > 0) {
    if (out.okBranches.length > 0) {
      io.stdout('\n')
    }
    io.stdout('FAIL  task-state-only commits on task branches:\n')
    for (const line of out.violationLines) {
      io.stdout(`${line}\n`)
    }
  }
  io.stdout('\n')
  if (out.totalViolations > 0) {
    io.stderr(
      `${out.totalViolations} task-state-only commit(s) found on task branches. ` +
        `State-tracking work belongs on \`main\`, not on the implementation ` +
        `branch — see ` +
        `docs/planning/tasks/2026-05-28-task-state-frontmatter-commits-` +
        `on-main-not-worktree-branch.md.\n`,
    )
    return 1
  }
  if (out.okBranches.length === 0) {
    io.stdout('no task/* branches present; nothing to check.\n')
  } else {
    io.stdout(`${out.okBranches.length} task branch(es) checked, no task-state-only commits.\n`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// Op definition
// ---------------------------------------------------------------------------

const input = z.object({
  projectRoot: z.string(),
  /**
   * Trunk ref the task branches are diffed against. Defaults to
   * `origin/main`. The lint ALWAYS additionally excludes local `main`
   * (and de-duplicates), so a not-yet-pushed task-state commit on local
   * main is never misread as a branch violation when origin lags under
   * parallel WIP ([[T-6R73-pre-commit-drift-hooks-gate-unconditionally-forcing-no]]).
   */
  baseRef: z.string().default('origin/main'),
})

export default defineOp({
  path: ['task', 'lint-state-origin'],
  summary: 'Enforce task-state frontmatter commits only on main, not task branches.',
  hidden: true,
  input,
  output,
  cli: {
    render: renderLintStateOrigin,
  },
  handler: (args, ctx) => {
    const repo = realResolve(args.projectRoot)
    let total: number
    let ok: string[]
    let violations: string[]
    try {
      ;[total, ok, violations] = lint(ctx.git, repo, args.baseRef)
    } catch (exc) {
      if (exc instanceof LintError) {
        throw new Error(`lint-state-origin: ${exc.message}`)
      }
      throw exc
    }
    return {
      totalViolations: total,
      okBranches: ok,
      violationLines: violations,
    }
  },
})
