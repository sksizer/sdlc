/**
 * The `task-lifecycle` commit kind: the single source of truth for the
 * stereotyped task-state commit subjects.
 *
 * Post-[[D-S30G-task-state-plane-split]] only two actions have live
 * producers — `promote-ready` (ensure-ready's promotion commit) and
 * `close-done` (`close-commit`) — because those are two of the four semantic
 * transitions that still commit to main. `start`, `verify-ready` and
 * `record-pr` describe the retired per-run mirror writes; they stay rendered
 * so historical subjects remain parseable, and retire with the schema-v6
 * contract sweep.
 *
 * Producers: the lifecycle scripts call `renderTaskLifecycleCommit` below;
 * LLM/prose call sites pipe a JSON payload to
 * `sdlc commit create --kind task-lifecycle --data -`. Both routes render the same
 * `template.eta`, so a subject-shape change is a one-file edit and the
 * invariants pinning these phrases (task-work, task-close-out) keep a
 * single source to drift against.
 *
 * Entity-specific code under the entity package; `commits/` is a sibling
 * of `ops/`, never inside it (the discovery walk imports everything in
 * `ops/` as op modules).
 *
 * zod/v4 — see `lib/services/report/schema.ts` for why payload contracts
 * use the v4 subpath while op contracts stay v3.
 */

import { join } from 'node:path'

import { z } from 'zod/v4'

import {
  type RenderableKind,
  renderKindTemplate,
  validateKindPayload,
} from '@lib/services/kind_render'
import { pluginLibDir } from '@lib/util/plugin-root'

/**
 * Every templated task-state transition. Subject shapes live in template.eta.
 *
 * `promote-ready` is the plane-split promotion commit
 * ([[D-S30G-task-state-plane-split]]): `planning/*` → `open/ready` plus
 * `readiness_verified_at` in ONE commit, because promotion IS the readiness
 * claim. `verify-ready` — the per-run stamp it replaces — stays defined while
 * `probe-state` still reports the legacy `main_head_is_verify_stamp` signal.
 */
export const lifecycleAction = z.enum([
  'start',
  'verify-ready',
  'promote-ready',
  'flag-needs-definition',
  'record-pr',
  'close-done',
  'close-obsoleted',
  'post-mortem',
])

export const taskLifecycleCommit = z.object({
  action: lifecycleAction,
  basename: z
    .string()
    .min(1)
    .describe('Task file basename without `.md`, e.g. `T-D7PW-templatized-commit-kinds`.'),
  detail: z
    .string()
    .optional()
    .describe(
      'Optional body paragraph (the task headline for `start`, the gap one-liner for `flag-needs-definition`, the PR URL for `record-pr`, the completion note for `close-*`).',
    ),
})

export type TaskLifecycleCommit = z.infer<typeof taskLifecycleCommit>

export const taskLifecycleCommitKind: RenderableKind = {
  slug: 'task-lifecycle',
  schema: taskLifecycleCommit,
  templatePath: join(
    pluginLibDir(),
    'model',
    'entities',
    'task',
    'commits',
    'lifecycle',
    'template.eta',
  ),
}

/**
 * Render a lifecycle commit message. Returns the full message plus the
 * subject/body split the lifecycle scripts' commit helpers take — derived
 * from the rendered output, never re-composed.
 */
export function renderTaskLifecycleCommit(payload: TaskLifecycleCommit): {
  subject: string
  body: string
  message: string
} {
  const validated = validateKindPayload(taskLifecycleCommitKind, payload, 'commit payload')
  const message = renderKindTemplate(taskLifecycleCommitKind, validated, {
    autoEscape: false,
  }).replace(/\n+$/, '')
  const split = message.indexOf('\n\n')
  if (split === -1) return { subject: message, body: '', message }
  return {
    subject: message.slice(0, split),
    body: message.slice(split + 2),
    message,
  }
}
