/**
 * `sdlc task update <task> --set '<json>'` — apply a JSON object of
 * frontmatter field updates to a task document, schema-validated before
 * anything is written. The JSON payload IS the parameter surface — scalars,
 * arrays, and nested values land verbatim; a JSON `null` deletes the key.
 *
 * The engine (JSON parse → immutable guard → field merge → schema gate →
 * body-preserving write) is the entity-agnostic `defineUpdateOp` factory
 * in `model/ops/_update.ts`, shared with `backlog update` and
 * `standard update` ([[D-0007-deterministic-op-substrate]] §2a, Cluster 6).
 * `standard supersede` is its own verb over the same module's
 * `applyFrontmatterUpdates`, not another `defineUpdateOp` registration.
 *
 * Guarantees (enforced by the shared engine):
 *   - identity fields are immutable here: updating `id`, `type`, or
 *     `schema_version` is INVALID_INPUT (`schema_version` belongs to
 *     /sdlc:entities-migrate);
 *   - the merged frontmatter must validate against the task schema or
 *     nothing is written;
 *   - the body is byte-untouched — only the frontmatter block is
 *     re-serialized (same canonicalization `model/ops/migrate.ts` applies);
 *   - `--dry-run` reports the would-change keys without writing.
 *
 * Committing stays out of scope: pair with
 * `sdlc commit create --kind task-lifecycle --data -` for the stereotyped
 * state-transition commits.
 */

import { defineUpdateOp } from '@lib/model/ops/_update'

export default defineUpdateOp('task')
