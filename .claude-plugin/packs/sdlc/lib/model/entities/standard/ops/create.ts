/**
 * `standard create` op ([[D-0007-deterministic-op-substrate]] §2a, [[T-0010]]).
 * A `defineCreateOp` spec; the shared factory (`@lib/model/ops/_create`) owns
 * the create shape. The slug derives from the required `title` unless given
 * explicitly. Field types derive from `StandardSchema` (`../schema.ts`), so
 * status/supersedes/superseded_by validate against the real enum/wikilink
 * patterns. `paths` is reshaped into the schema's `applies_to.paths`.
 * Callers own the `closed/superseded` consistency rule.
 */

import { z } from 'zod'

import { defineCreateOp } from '@lib/model/ops/_create'
import { todayUtc } from '@lib/util/date'

export default defineCreateOp({
  type: 'standard',
  summary: 'Author a new standard with a minted S-NNNN identity.',
  identity: { kind: 'slugged', sourceKey: 'title' },
  fields: {
    title: { cli: { short: 't' } },
    created: { birthDefault: () => todayUtc() },
    /** At least one glob — `applies_to.paths` is the standard's scope. */
    paths: {
      schema: z.array(z.string()).min(1),
      fmKey: 'applies_to',
      toYaml: (paths) => ({ paths: [...(paths as string[])] }),
      cli: { valueName: 'GLOB' },
    },
    status: {},
    related: {},
    supersedes: {},
    supersededBy: { fmKey: 'superseded_by' },
  },
})
