/**
 * `sdlc standard update <standard> --set '<json>'` — apply a JSON object of
 * frontmatter field updates to a standard document, schema-validated before
 * anything is written.
 *
 * The deterministic surface for /sdlc:standard-new and peers instead of
 * hand-edited frontmatter: status flips `open/proposed → open/active`,
 * `last_reviewed` bumps, `deprecation_note` set. One shared `defineUpdateOp`
 * factory (`_update.ts`), registered per mutable entity — only the noun and
 * schema differ ([[D-0007-deterministic-op-substrate]] §2a, Cluster 6).
 *
 * The standard's supersession transition is its own verb
 * (`standard supersede`, see `./supersede.ts`) because it is a two-field,
 * predecessor-pointing mutation with a distinct contract; this op is the
 * general scalar-field surface for every other standard mutation.
 */

import { defineUpdateOp } from '@lib/model/ops/_update'

export default defineUpdateOp('standard')
