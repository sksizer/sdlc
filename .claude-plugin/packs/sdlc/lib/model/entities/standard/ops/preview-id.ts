/**
 * `standard preview-id` op — READ-ONLY companion to `standard create`
 * ([[P-0001]]).
 *
 * Given a freeform title-or-string, reports the slug + `S-NNNN` id `create`
 * would assign (with `--slug` omitted) and any exact/similar same-type slug
 * collisions. Writes nothing. One shared impl (`_preview_id.ts`), registered
 * per slugged entity — see that module for the full contract.
 */

import { definePreviewIdOp } from '@lib/model/ops/_preview_id'

export default definePreviewIdOp('standard')
