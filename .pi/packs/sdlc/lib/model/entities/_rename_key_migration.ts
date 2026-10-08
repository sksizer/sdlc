/**
 * The rename-key migration factory.
 *
 * A schema bump that renames one frontmatter key to another — same value,
 * same position in spirit (the runner's `reorderFrontmatterKeys` in
 * `ops/migrate.ts` re-sorts to the registry's `keyOrder` afterward, so this
 * factory need not care about position) — is otherwise a plain restamp. The
 * `status` -> `state` entity-frontmatter rename ([[D-S30G]]'s sibling
 * "state" concept is a different, unrelated runtime-lease field; this is the
 * lifecycle-field rename) is exactly that shape across all twelve entity
 * types, so this is their shared body — the cross-type counterpart to each
 * type's own per-type `_stamp_only.ts`.
 *
 * Arity matters. The migrate runner routes on `transform.length >= 2`
 * ([`ops/migrate.ts`](../ops/migrate.ts) `transformWantsBody`), so the
 * returned callable takes exactly ONE parameter and keeps the historical
 * frontmatter-only `migrate(fm) -> new_fm` contract. Do not add a second
 * parameter here without also teaching the runner.
 *
 * Every entity type's migrations now throw the one shared `MigrationError`
 * class (`_migration_error.ts`, re-exported per type from that type's own
 * `errors.ts` — [[T-ZRO1]]). This factory still takes the caller's error
 * constructor instead of importing `MigrationError` directly, so it stays
 * free of a dependency on the migrations tree; the thrown error still
 * satisfies `instanceof` checks written against the caller's re-exported
 * `MigrationError`, since it is the same class.
 *
 * The returned transform is stamped `appliesToClosed: true`
 * ([#2412](https://github.com/sksizer/dev/pull/2412) review round 1) — the
 * `migrate` op (`ops/migrate.ts`) reads this flag off
 * the transform function to decide whether a CLOSED entity still gets a
 * pending step applied when the caller did not pass `--include-closed`.
 * A closed entity is otherwise frozen (no shape/content change), but a key
 * rename doesn't reinterpret frozen content — it relabels the same value —
 * so every rename this factory produces is safe to apply unconditionally.
 * A transform built some other way (a body-shape change) has no such flag
 * and stays subject to the ordinary closed-skip default.
 */

import { isRecord } from '@lib/util/guards'
import { typeName } from '@lib/util/diagnostics'

export type Frontmatter = Record<string, unknown>

/** A migration transform that is safe to run on a closed (frozen) entity. */
export interface ClosedSafeTransform {
  (fm: Frontmatter): Frontmatter
  readonly appliesToClosed: true
}

/**
 * Build the `migrate` for a schema bump that renames `oldKey` to `newKey`
 * and restamps `schema_version`.
 *
 * The returned transform:
 *   - returns a *new* object; the input is not mutated;
 *   - when `oldKey` is present, moves its value to `newKey` (last-wins if
 *     `newKey` was somehow already present — `oldKey`'s value takes it) and
 *     removes `oldKey`;
 *   - when `oldKey` is absent (already migrated, or never set), leaves the
 *     object's other keys untouched — restamping is still applied;
 *   - stamps `schema_version: version` (string-typed, matching the schema's
 *     `type: string` declaration);
 *   - preserves every other field unchanged;
 *   - is idempotent — re-running on an instance already at `version` with
 *     `newKey` already in place is a no-op beyond the new-object contract;
 *   - throws `new ErrorCtor(...)` for non-mapping input;
 *   - carries `appliesToClosed: true` (see module doc) so `ops/migrate.ts`
 *     applies it even to a closed entity by default.
 */
export function renameKeyMigration(
  oldKey: string,
  newKey: string,
  version: string,
  ErrorCtor: new (message: string) => Error,
): ClosedSafeTransform {
  const migrate = function migrate(fm: Frontmatter): Frontmatter {
    if (!isRecord(fm)) {
      throw new ErrorCtor(`frontmatter must be a mapping, got ${typeName(fm)}`)
    }
    const next: Frontmatter = { ...fm }
    if (Object.prototype.hasOwnProperty.call(next, oldKey)) {
      next[newKey] = next[oldKey]
      delete next[oldKey]
    }
    next['schema_version'] = version
    return next
  } as ClosedSafeTransform
  ;(migrate as { appliesToClosed: true }).appliesToClosed = true
  return migrate
}
