/**
 * `task create` op ([[D-0007-deterministic-op-substrate]] §2a, [[T-0010]]) —
 * a `defineCreateOp` spec; the shared factory (`@lib/model/ops/_create`)
 * owns the create shape (slug gate, frontmatter assembly, path-only stdout
 * contract).
 *
 * The slug is optional: when omitted it is derived from `headline` via the
 * shared `resolveCreateSlug`/`deriveSlug` ([[P-0001]]) — one derivation the
 * `preview-id` op shares — so a bare `sdlc task create --headline <h>` mints
 * a slug without the caller restating it. An explicit slug always wins, and
 * must pass `SLUG_RE` (the factory's gate — the `/sdlc:task-new` head trusts
 * the op's exit code instead of re-spelling the pattern in prose).
 *
 * Field types and static birth defaults derive from `TaskSchema`
 * (`../schema.ts`): a bare invocation authors status `planning/draft`,
 * impact/complexity `medium` via the authoring pipeline's schema-default
 * merge — a task is never born closed/ or in-progress. `created` is the one
 * op-owned (dynamic) birth default; `headline` is the one op-only field.
 * Absent `priority` omits the key (absent == false;
 * D-Q2WR-task-pickup-order). Absent `kind` likewise omits the key —
 * `task next` reads absent as `implementation`
 * ([[D-VSLI-distributed-work-runner-architecture]]), so the birth default is "no key".
 */

import { z } from 'zod'

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'task',
  summary: 'Author a new task with a minted T-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'headline', exposeSeed: true },
  fields: {
    headline: {
      schema: z.string().nullable().default(null),
      noFrontmatter: true,
      cli: { short: 'H' },
    },
    status: {},
    created: { birthDefault: () => todayUtc() },
    impact: {},
    complexity: {},
    priority: {},
    autonomy: {},
    kind: {},
    tags: { cli: { valueName: 'TAG' } },
    related: {},
  },
})
