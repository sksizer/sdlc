import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const TermNoun: EntityNoun = {
  summary: "One entry of SDLC's shared vocabulary.",
  create: {
    summary: 'Author a new glossary term with a minted TM-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      created: createdToday,
      state: {},
      aliases: {},
      related: {},
    },
  },
  reads: true,
}
