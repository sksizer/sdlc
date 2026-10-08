import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const CapabilityNoun: EntityNoun = {
  summary: 'A unit of functionality the system provides.',
  create: {
    summary: 'Author a new capability with a minted C-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      created: createdToday,
      state: {},
      kind: {},
      audience: {},
      parentKey: { fmKey: 'parent_key', cli: { valueName: 'WIKILINK' } },
      locations: { cli: { valueName: 'LOCATION' } },
      product: { cli: { valueName: 'WIKILINK' } },
      related: {},
      tags: { cli: { valueName: 'TAG' } },
      needHumanReview: { fmKey: 'need_human_review' },
      createdAt: { fmKey: 'created_at', cli: { valueName: 'ISO-DATETIME' } },
      provenance: {},
    },
  },
  update: true,
  reads: true,
}
