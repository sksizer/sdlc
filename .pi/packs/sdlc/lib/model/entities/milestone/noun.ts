import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

export const MilestoneNoun: EntityNoun = {
  summary: 'A release-shaped grouping of Tasks with a target date and success criteria.',
  create: {
    summary: 'Author a new milestone with a system-assigned M-NNNN id.',
    identity: { kind: 'id-only', seedKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      state: {},
      created: createdToday,
      version: {},
      targetDate: { fmKey: 'target_date' },
      tasks: { cli: { valueName: 'TASK' } },
      capabilities: { cli: { valueName: 'CAPABILITY' } },
      tags: { cli: { valueName: 'TAG' } },
      related: {},
    },
  },
  reads: true,
}
