import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const ReferenceNoun: EntityNoun = {
  summary: 'One curated external source.',
  create: {
    summary: 'Author a new external-source reference with a minted RF-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      url: {},
      created: createdToday,
      state: {},
      related: {},
    },
  },
  reads: true,
}
