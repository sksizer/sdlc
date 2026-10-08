import { z } from 'zod'

import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

/**
 * Absent `priority` and `kind` omit the key: `task next` reads absent
 * `priority` as false and absent `kind` as `implementation`.
 */
export const TaskNoun: EntityNoun = {
  summary: 'Atomic unit of executable work — one problem, one implementer.',
  create: {
    summary: 'Author a new task with a minted T-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'headline', exposeSeed: true },
    fields: {
      headline: {
        schema: z.string().nullable().default(null),
        noFrontmatter: true,
        cli: { short: 'H' },
      },
      state: {},
      created: createdToday,
      impact: {},
      complexity: {},
      priority: {},
      autonomy: {},
      kind: {},
      tags: { cli: { valueName: 'TAG' } },
      related: {},
    },
  },
  update: true,
  reads: true,
}
