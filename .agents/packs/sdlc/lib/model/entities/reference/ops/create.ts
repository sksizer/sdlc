/**
 * `reference create` op — entity CRUD for the Reference type, born in
 * `lib` per [[D-0007-deterministic-op-substrate]] §2a; the generated
 * references roster (`docs/references.md`) is assembled from the instances
 * ([[D-0009-reference-entity-and-docs-appendix]]). A `defineCreateOp`
 * spec; the shared factory (`@lib/model/ops/_create`) owns the create
 * shape. The slug derives from the required `title` (the source's name)
 * unless given explicitly. Field types derive from `ReferenceSchema`
 * (`../schema.ts`) — `url` validates as a real URL at input; `created` is
 * the one op-owned (dynamic) birth default.
 */

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'reference',
  summary: 'Author a new external-source reference with a minted RF-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    url: {},
    created: { birthDefault: () => todayUtc() },
    status: {},
    related: {},
  },
})
