/**
 * `sdlc task dispatch <id>` — run the define/implement/check/judge sequence
 * for ONE task on demand, outside a tick.
 *
 * This is the manual escape hatch the Router MVP's added requirements call
 * for: a per-item dispatch that works even while `sdlc orchestrate pause`
 * is active (the pause switch, `dispatch/pause.ts`, is a TICK-level gate —
 * `runWorkTick` reads it once per tick, AFTER its own read-only `task next`/
 * `task inflight` calls, and skips only the per-candidate dispatch loop,
 * same shape as `prs.ts`/`merges.ts`'s pause check; this op calls straight
 * through to `dispatchOneTask`, which has no pause check at all, by
 * construction, the same way the Router's own `deliver()` is pause-agnostic).
 *
 * Reuses `dispatchOneTask` (`@lib/services/orchestrator/ticks/work.ts`) —
 * the EXACT per-basename lease-claim + sequence body `runWorkTick`'s own
 * loop calls, extracted once so this op and the tick can never drift apart.
 * That means the SAME safety properties apply here as in a tick:
 *   - the `max_implementations` slot backstop still applies (`claim:
 *     'capped'`) — a manual dispatch does not let a human silently exceed
 *     the cap;
 *   - the per-task `orchestrate-work/<basename>` operation lease and
 *     `lease task acquire` still gate it (`claim: 'lost'`) — this op cannot
 *     race a concurrent tick or another manual dispatch of the same task;
 *   - a pending hook park marker for the task's branch still short-circuits
 *     it (`claim: 'parked'`).
 *
 * No `--force`: unlike the Router (`pr route`/`pr update`, whose
 * idempotence is a SIGNATURE-keyed `DeliveryRecord` that `--force` can
 * legitimately re-arm), a task dispatch's only concurrency guard is the
 * lease pair above — there is no delivered-signature ledger to bypass, and
 * force-stealing an actively-held lease would let two runs of
 * define/implement/check/judge collide on the same worktree. `--dry-run`
 * only reports the plan (basename + `would-dispatch`); it claims no lease
 * and calls no workflow.
 *
 * Does NOT run `task next`'s candidate filtering (state, autonomy,
 * `depends_on`) — naming a specific `basename` IS the override for that
 * filtering. A caller who wants the tick's own picks should use
 * `sdlc orchestrate run --loop work` instead.
 */

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import { tickCtxFrom } from '@lib/services/orchestrator/ticks/_types'
import { dispatchOneTask } from '@lib/services/orchestrator/ticks/work'

import inflightOp from './inflight.ts'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const input = z.object({
  basename: z.string().describe('Task basename to dispatch (e.g. 2026-01-01-my-task).'),
})

const parkedSchema = z.object({
  hook: z.string(),
  step: z.string(),
  exitCode: z.number(),
  workflow: z.string().optional(),
})

const output = z.object({
  basename: z.string(),
  claim: z
    .enum(['won', 'lost', 'parked', 'capped', 'would-dispatch'])
    .describe(
      "'won': the sequence ran (see `ok`). 'lost': the task's op-lease or task-lease is held " +
        "elsewhere right now — retry later. 'parked': a hook park marker was already pending for " +
        "this task's branch; not dispatched. 'capped': no free max_implementations slot right " +
        "now. 'would-dispatch': --dry-run only.",
    ),
  /** Set only when `claim === 'won'`: whether the define/implement/check/judge sequence completed clean. */
  ok: z.boolean().optional(),
  /** Set only when `ok === false`: the workflow name whose step failed (or that produced the park). */
  failedWorkflow: z.string().optional(),
  /** Set when a hook park marker parked the task (`claim === 'parked'`, or `won` with `ok: false`). */
  parked: parkedSchema.optional(),
})

// ---------------------------------------------------------------------------
// Op
// ---------------------------------------------------------------------------

export default defineOp({
  path: ['task', 'dispatch'],
  summary:
    'Run the define/implement/check/judge dispatch sequence for one task on demand — the same per-task lease/sequence a work tick uses, callable manually even while `sdlc orchestrate pause` is active.',
  mutating: true,
  // `dispatchOneTask` runs the define/implement/check/judge sequence via
  // `runWorkflow` -> session launch — a child-LLM call at a judgment port
  // ([[S-0004]] mechanism 3), reached transitively the same way `pr route`
  // reaches one through `deliver()`. The marking is op-level (same
  // convention `session launch`/`pr route` use).
  judgmentPort: true,
  needs: ['git'],
  input,
  output,
  cli: {
    positionals: ['basename'],
    render: (out, io) => {
      const detail =
        out.ok === false && out.failedWorkflow !== undefined
          ? ` (failed: ${out.failedWorkflow})`
          : ''
      io.stdout(`${out.basename}: ${out.claim}${detail}\n`)
    },
  },
  handler: async (args, ctx) => {
    // `noGh: false` matches `runWorkTick`'s own call — `task inflight`'s
    // `awaiting-review` bucket needs a live `gh pr list` to categorize
    // correctly, and `max_implementations` (the only field this op reads)
    // does not depend on it either way.
    const inflight = await inflightOp.handler({ noGh: false }, ctx)
    const maxImpl = inflight.limits.max_implementations

    // `--dry-run` is the registry's own global flag (`ctx.dryRun`), not a
    // custom input field — same convention every other op in this registry
    // follows (see `lib/registry.ts`'s `OpCtx.dryRun` doc).
    if (ctx.dryRun) {
      return { basename: args.basename, claim: 'would-dispatch' as const }
    }

    const tickCtx = tickCtxFrom(ctx)
    return dispatchOneTask(tickCtx, args.basename, maxImpl)
  },
})
