import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const RoadmapNoun: EntityNoun = {
  summary: 'A living tracking document that groups Milestones under version sections.',
  create: {
    summary: 'Author a new roadmap with a system-assigned RM-NNNN id.',
    identity: { kind: 'id-only', seedKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      state: {},
      created: createdToday,
      planDoc: { fmKey: 'plan_doc', cli: { valueName: 'NOTE' } },
      related: {},
      tags: { cli: { valueName: 'TAG' } },
    },
  },
  reads: true,
}
