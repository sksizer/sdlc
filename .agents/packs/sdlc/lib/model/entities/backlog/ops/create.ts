/**
 * `backlog create` op ([[D-0007-deterministic-op-substrate]] §2a,
 * [[T-0010]]) — a `defineCreateOp` spec; the shared factory
 * (`@lib/model/ops/_create`) owns the create shape.
 *
 * The slug is optional: when omitted it is derived from `title` via the
 * shared `deriveSlug` ([[P-0001]]); an explicit slug always wins. `title`
 * is identity/template-only — backlog's authored frontmatter carries no
 * title. Field types derive from `BacklogSchema` (`../schema.ts`), so
 * `status`/`result` validate against the real enum/pattern at input.
 */

import { defineCreateOp } from '@lib/model/ops/_create'

export default defineCreateOp({
  type: 'backlog',
  summary: 'Author a new backlog item with a minted B-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'title', exposeSeed: true },
  fields: {
    title: { noFrontmatter: true, cli: { short: 't' } },
    tags: { cli: { valueName: 'TAG' } },
    status: {},
    result: {},
  },
})
