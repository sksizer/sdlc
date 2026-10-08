import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const NoteNoun: EntityNoun = {
  summary: 'A freeform document with strict frontmatter that sits in the ontology graph.',
  create: {
    summary: 'Author a new freeform note with a minted N-XXXX identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      genre: {},
      parent: {},
      state: {},
      related: {},
      created: createdToday,
    },
  },
  reads: true,
}
