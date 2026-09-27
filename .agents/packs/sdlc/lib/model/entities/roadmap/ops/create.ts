/**
 * `roadmap create` op ([[D-0007-deterministic-op-substrate]] §2a) — a
 * `defineCreateOp` spec; the shared factory (`@lib/model/ops/_create`) owns
 * the create shape.
 *
 * Roadmaps are id-only (no slug in the filename), same as milestone: renaming
 * the title never breaks inbound wikilinks. The id mint is seeded from the
 * required `title` so parallel branches minting different roadmaps get
 * different ids. Field types and the status birth default (`open/draft`)
 * derive from `RoadmapSchema` (`../schema.ts`); `created` is the one
 * op-owned (dynamic) birth default.
 */

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'roadmap',
  summary: 'Author a new roadmap with a system-assigned RM-NNNN id.',
  identity: { kind: 'id-only', seedKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    status: {},
    created: { birthDefault: () => todayUtc() },
    planDoc: { fmKey: 'plan_doc', cli: { valueName: 'DOC' } },
    related: {},
    tags: { cli: { valueName: 'TAG' } },
  },
})
