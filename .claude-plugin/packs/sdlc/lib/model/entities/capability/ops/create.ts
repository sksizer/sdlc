/**
 * `capability create` op — a `defineCreateOp` spec; the shared factory
 * (`@lib/model/ops/_create`) owns the create shape. The slug derives from
 * the required `title` unless given explicitly. Field types derive from
 * `CapabilitySchema` (`../schema.ts`), so `kind`, `audience`, `parent_key`
 * and every `locations` entry validate against the real enums and the
 * five-form Location grammar at input.
 */

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'capability',
  summary: 'Author a new capability with a minted C-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    created: { birthDefault: () => todayUtc() },
    status: {},
    kind: {},
    audience: {},
    parentKey: { fmKey: 'parent_key', cli: { valueName: 'WIKILINK' } },
    locations: { cli: { valueName: 'LOCATION' } },
    related: {},
    tags: { cli: { valueName: 'TAG' } },
    needHumanReview: { fmKey: 'need_human_review' },
    createdAt: { fmKey: 'created_at', cli: { valueName: 'ISO-DATETIME' } },
    provenance: {},
  },
})
