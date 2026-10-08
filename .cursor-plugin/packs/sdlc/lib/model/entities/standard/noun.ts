import { z } from 'zod'

import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

/**
 * Supersession is its own verb (`standard supersede`); callers own the
 * `closed/superseded` consistency rule on create.
 */
export const StandardNoun: EntityNoun = {
  summary: 'A rule that prescribes behavior on a scoped set of paths.',
  create: {
    summary: 'Author a new standard with a minted S-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      created: createdToday,
      paths: {
        schema: z.array(z.string()).min(1),
        fmKey: 'applies_to',
        toYaml: (paths) => ({ paths: [...(paths as string[])] }),
        cli: { valueName: 'GLOB' },
      },
      state: {},
      related: {},
      supersedes: {},
      supersededBy: { fmKey: 'superseded_by' },
    },
  },
  update: true,
  reads: true,
}
