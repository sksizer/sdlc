/**
 * Typed task read — the per-entity narrowing of `model/read.ts#readEntity`
 * ([[T-N9PM]]).
 *
 * `readTask` returns the same discriminated wrapper with the success arm's
 * `doc.frontmatter` typed as `Task` (the `TaskSchema` inference, defaults
 * applied). The fail arm is unchanged: best-effort hydrated `fm` + raw body +
 * findings — a schema-drifted task at an old rev still yields its raw
 * `status` there.
 */

import type { Contract } from 'markdown-contract'

import { readEntity, type EntityReadResult, type ReadEntityOptions } from '@lib/model/read'
import { TaskContract, type Task } from './schema.ts'

/** The body-plane type the task birth contract infers. */
type TaskBody = typeof TaskContract extends Contract<unknown, infer B> ? B : never

/** `EntityReadResult` with the success arm narrowed to the task contract. */
export type TaskReadResult = EntityReadResult<Task, TaskBody>

/**
 * Read one task. Same `ref` spellings and source seam as `readEntity`;
 * `null` when absent at that source. The cast is sound by construction: the
 * `"task"` registry entry IS `TaskContract`, so the type-erased core already
 * produced this shape.
 */
export function readTask(ref: string, opts: ReadEntityOptions): TaskReadResult | null {
  return readEntity('task', ref, opts) as TaskReadResult | null
}
