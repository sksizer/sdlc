/**
 * `capability preview-id` op — READ-ONLY companion to `capability create`
 * ([[P-0001]]). Reports the slug + `C-NNNN` id `create` would assign and any
 * exact/similar same-type slug collisions. Writes nothing. One shared impl
 * (`@lib/model/ops/_preview_id`), registered per slugged entity.
 */

import { definePreviewIdOp } from '@lib/model/ops/_preview_id'

export default definePreviewIdOp('capability')
