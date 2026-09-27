/**
 * `sdlc task inflight` — categorise in-flight tasks for /sdlc:orchestrate.
 *
 * An "in-flight" task is any task that has a worktree under
 * `.sdlc/worktrees/<basename>/` AND a matching local branch named
 * `task/<basename>`. For each such pair the task file's `status:` frontmatter
 * is read, the task's lease is read off the LOCAL ref mirror, and
 * `gh pr list --search "head:<branch>"` is queried to detect an open PR.
 *
 * Categories: implementing | awaiting-review | stale | other.
 *
 * Classification prefers the LEASE ([[D-S30G-task-state-plane-split]]):
 * execution state is authoritative in the lease substrate, and frontmatter
 * `status` no longer moves during a run. The frontmatter rule stays as the
 * fallback for tasks with no lease in the mirror.
 *
 * The render hook reproduces the `--format summary` line that
 * count_inflight_tasks.ts emits for /sdlc:orchestrate digest consumption:
 *
 *     inflight={implementing=I,awaiting-review=A,stale=S} caps-reached=<list|none>
 *
 * `--output json` carries the full structured buckets (limits, counts,
 * caps_reached, tasks[]).
 */

import { existsSync } from 'node:fs'

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import type { OpIo } from '@lib/registry'
import { listWorktreeBasenames } from '@lib/util/git'
import { realResolve } from '@lib/util/paths'

import {
  frontmatterString,
  listLocalBranches,
  openPrForBranch,
  readFrontmatter,
  readLocalLease,
  taskBranch,
  taskFilePath,
  worktreePath,
} from './_probe_core.ts'

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_IMPLEMENTATIONS = 5
const DEFAULT_MAX_AWAITING_REVIEW = 20

const CATEGORY_IMPLEMENTING = 'implementing'
const CATEGORY_AWAITING_REVIEW = 'awaiting-review'
const CATEGORY_STALE = 'stale'
const CATEGORY_OTHER = 'other'

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Bucket one task from its frontmatter status, its lease phase, and its open PR.
 *
 * Precedence:
 *
 * 1. `closed/*` on frontmatter → `stale`. Closure is a semantic commit that
 *    outlives any run, so a closed task whose worktree/branch/lease survive is
 *    exactly the leftover this category names — the lease cannot argue.
 * 2. The lease phase, when the mirror carries one. `claimed`/`working` hold an
 *    implementation slot; `awaiting-review`/`responding` hold a review slot.
 *    Phase beats an open PR: the PR appears a moment before the transition to
 *    `awaiting-review` lands, and the lease is the authority on which slot the
 *    run occupies.
 * 3. `blocked` → `other`, matching the frontmatter rule it replaces
 *    (`in-progress/blocked` has always landed in `other`). `closing` also falls
 *    through: a run in close-out is neither implementing nor awaiting review.
 * 4. No lease → the pre-split frontmatter rule, unchanged.
 *
 * `leasePhase` defaults to null so a caller that has not gone lease-aware yet
 * (the dashboard's local-worktree panel, [[D-S30G-task-state-plane-split]]
 * stage 6) keeps today's frontmatter behavior rather than silently
 * misclassifying.
 */
function classify(
  taskStatus: string | null,
  openPrNumber: number | null,
  leasePhase: string | null = null,
): string {
  if (taskStatus && taskStatus.startsWith('closed/')) return CATEGORY_STALE

  if (leasePhase === 'claimed' || leasePhase === 'working') {
    return CATEGORY_IMPLEMENTING
  }
  if (leasePhase === 'awaiting-review' || leasePhase === 'responding') {
    return CATEGORY_AWAITING_REVIEW
  }
  if (leasePhase !== null) return CATEGORY_OTHER

  if (taskStatus === 'in-progress') {
    return openPrNumber === null ? CATEGORY_IMPLEMENTING : CATEGORY_AWAITING_REVIEW
  }
  return CATEGORY_OTHER
}

// ── output schema ─────────────────────────────────────────────────────────────

const InflightTask = z.object({
  basename: z.string(),
  worktree_path: z.string(),
  branch: z.string(),
  task_status: z.string().nullable(),
  open_pr_number: z.number().int().nullable(),
  /** Execution phase off the local lease mirror, or null when no lease. */
  lease_phase: z.string().nullable(),
  category: z.string(),
})

const output = z.object({
  limits: z.object({
    max_implementations: z.number(),
    max_awaiting_review: z.number(),
  }),
  counts: z.record(z.string(), z.number()),
  caps_reached: z.array(z.string()),
  tasks: z.array(InflightTask),
})

type Output = z.infer<typeof output>

// ── render hook ───────────────────────────────────────────────────────────────

function renderInflight(out: Output, io: OpIo): number {
  const c = out.counts
  const parts = [
    `implementing=${c[CATEGORY_IMPLEMENTING] ?? 0}`,
    `awaiting-review=${c[CATEGORY_AWAITING_REVIEW] ?? 0}`,
    `stale=${c[CATEGORY_STALE] ?? 0}`,
  ]
  const inflightField = 'inflight={' + parts.join(',') + '}'
  const caps = out.caps_reached ?? []
  const capsField = 'caps-reached=' + (caps.length ? caps.join(',') : 'none')
  io.stdout(`${inflightField} ${capsField}\n`)
  return 0
}

// ── op definition ─────────────────────────────────────────────────────────────

const input = z.object({
  noGh: z.boolean().default(false),
})

export default defineOp({
  path: ['task', 'inflight'],
  summary: 'Categorise in-flight tasks (implementing / awaiting-review / stale / other).',
  input,
  output,
  cli: {
    flags: { noGh: { help: 'Skip gh pr list queries (hermetic/offline mode).' } },
    render: renderInflight,
  },
  handler: (args, ctx) => {
    const projectRoot = realResolve(ctx.projectRoot)
    // A git worktree carries .git as a file; accept either (scan degrades gracefully).
    void existsSync

    // ctx.sdlcConfig is hydrated by createCtx; degrade-to-defaults on any error.
    const maxImpl = ctx.sdlcConfig.orchestrator?.max_implementations ?? DEFAULT_MAX_IMPLEMENTATIONS
    const maxRev = ctx.sdlcConfig.orchestrator?.max_awaiting_review ?? DEFAULT_MAX_AWAITING_REVIEW

    const branches = listLocalBranches(projectRoot, ctx)
    const basenames = listWorktreeBasenames(projectRoot)

    const tasks: z.infer<typeof InflightTask>[] = []
    for (const basename of basenames) {
      const branch = taskBranch(basename)
      if (!branches.has(branch)) continue

      const taskStatus = frontmatterString(
        readFrontmatter(taskFilePath(projectRoot, basename)),
        'status',
      )

      let openPrNumber: number | null = null
      if (!args.noGh) {
        openPrNumber = openPrForBranch(branch, projectRoot, ctx)
      }

      // Local mirror only — the roster scan runs every orchestrate tick and
      // must stay network-free.
      const leasePhase = readLocalLease(basename, projectRoot, ctx)?.phase ?? null

      const category = classify(taskStatus, openPrNumber, leasePhase)
      tasks.push({
        basename,
        worktree_path: worktreePath(projectRoot, basename),
        branch,
        task_status: taskStatus,
        open_pr_number: openPrNumber,
        lease_phase: leasePhase,
        category,
      })
    }

    const counts: Record<string, number> = {
      [CATEGORY_IMPLEMENTING]: 0,
      [CATEGORY_AWAITING_REVIEW]: 0,
      [CATEGORY_STALE]: 0,
      [CATEGORY_OTHER]: 0,
    }
    for (const t of tasks) {
      counts[t.category] = (counts[t.category] ?? 0) + 1
    }

    const capsReached: string[] = []
    if ((counts[CATEGORY_IMPLEMENTING] ?? 0) >= maxImpl) capsReached.push('max_implementations')
    if ((counts[CATEGORY_AWAITING_REVIEW] ?? 0) >= maxRev) capsReached.push('max_awaiting_review')

    return {
      limits: { max_implementations: maxImpl, max_awaiting_review: maxRev },
      counts,
      caps_reached: capsReached,
      tasks,
    }
  },
})

export { classify }
