/**
 * `term create` op — entity CRUD for the Term type, born in `lib` per
 * [[D-0007-deterministic-op-substrate]] §2a; the generated glossary
 * (`docs/glossary.md`) is assembled from the instances
 * ([[D-B4CA-term-entity-and-generated-glossary]]). A `defineCreateOp`
 * spec; the shared factory (`@lib/model/ops/_create`) owns the create
 * shape. The slug derives from the required `title` (the term itself,
 * canonical capitalization) unless given explicitly. Field types derive
 * from `TermSchema` (`../schema.ts`); `created` is the one op-owned
 * (dynamic) birth default.
 */

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'term',
  summary: 'Author a new glossary term with a minted TM-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    created: { birthDefault: () => todayUtc() },
    status: {},
    aliases: {},
    related: {},
  },
})
