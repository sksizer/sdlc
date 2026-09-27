/**
 * `milestone create` op ([[D-0007-deterministic-op-substrate]] §2a,
 * [[T-0010]]) — a `defineCreateOp` spec; the shared factory
 * (`@lib/model/ops/_create`) owns the create shape.
 *
 * Milestones are id-only (no slug in the filename): renaming the title
 * never breaks inbound wikilinks. The id mint is seeded from the required
 * `title` so parallel branches minting different milestones get different
 * ids. Field types and the status birth default (`open/draft`) derive from
 * `MilestoneSchema` (`../schema.ts`), so version/target_date/tasks validate
 * against the real semver/date/wikilink patterns at input; `created` is the
 * one op-owned (dynamic) birth default.
 */

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'milestone',
  summary: 'Author a new milestone with a system-assigned M-NNNN id.',
  identity: { kind: 'id-only', seedKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    status: {},
    created: { birthDefault: () => todayUtc() },
    version: {},
    targetDate: { fmKey: 'target_date' },
    tasks: { cli: { valueName: 'TASK' } },
    tags: { cli: { valueName: 'TAG' } },
    related: {},
  },
})
