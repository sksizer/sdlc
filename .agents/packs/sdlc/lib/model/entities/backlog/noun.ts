import type { EntityNoun } from '../_nouns.ts'

/**
 * `title` seeds the slug but is not written: backlog frontmatter has no title.
 * On update, `closed/abandoned` forbids `result` (set it to null); the other
 * state/`result` rules are in `./schema.ts`.
 */
export const BacklogNoun: EntityNoun = {
  summary: 'Pre-triage idea capture — deliberately unstructured, cheap to write.',
  create: {
    summary: 'Author a new backlog item with a minted B-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title', exposeSeed: true },
    fields: {
      title: { noFrontmatter: true, cli: { short: 't' } },
      tags: { cli: { valueName: 'TAG' } },
      state: {},
      result: {},
    },
  },
  update: true,
  reads: true,
}
