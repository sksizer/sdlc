/**
 * `sdlc capability update <capability> --set '<json>'` — apply a JSON object
 * of frontmatter field updates to a capability document, schema-validated
 * before anything is written. One shared `defineUpdateOp` factory
 * (`@lib/model/ops/_update`), registered per mutable entity.
 *
 * The capability schema enforces the carry-edges through the shared engine's
 * schema gate: `kind` must be one of the `CAPABILITY_KINDS` grains, `parent_key` a
 * capability wikilink or null, every `locations` entry a valid Location.
 */

import { defineUpdateOp } from '@lib/model/ops/_update'

export default defineUpdateOp('capability')
