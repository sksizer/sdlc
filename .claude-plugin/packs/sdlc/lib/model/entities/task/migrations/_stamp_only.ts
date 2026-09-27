/**
 * The stamp-only migration factory.
 *
 * Some schema bumps move no frontmatter values and rewrite no body: the new
 * version only ADDS an optional field or tightens a field description, so
 * every existing instance is already valid under it and migrating is just
 * restamping `schema_version`. `v3-to-v4` (adds `prs:`), `v4-to-v5` (adds
 * `priority:`) and `v5-to-v6` (adds `scope:` / `scheduling:`) are all that
 * shape; this is their shared body.
 *
 * Arity matters. The migrate runner routes on `transform.length >= 2`
 * ([`ops/migrate.ts`](../../../ops/migrate.ts) `transformWantsBody`), so the
 * returned callable takes exactly ONE parameter and keeps the historical
 * frontmatter-only `migrate(fm) -> new_fm` contract. Do not add a second
 * parameter here without also teaching the runner.
 */

import { isRecord } from '@lib/util/guards'
import { typeName } from '@lib/util/diagnostics'

import { MigrationError } from './errors.ts'

export type Frontmatter = Record<string, unknown>

/**
 * Build the `migrate` for a schema bump that only restamps `schema_version`.
 *
 * The returned transform:
 *   - returns a *new* object; the input is not mutated;
 *   - stamps `schema_version: version` (string-typed, matching the schema's
 *     `type: string` declaration);
 *   - preserves every other field unchanged;
 *   - is idempotent — restamping an instance already at `version` is a no-op
 *     beyond the new-object contract;
 *   - throws `MigrationError` for non-mapping input.
 */
export function stampOnlyMigration(version: string): (fm: Frontmatter) => Frontmatter {
  return function migrate(fm: Frontmatter): Frontmatter {
    if (!isRecord(fm)) {
      throw new MigrationError(`frontmatter must be a mapping, got ${typeName(fm)}`)
    }
    const next: Frontmatter = { ...fm }
    next['schema_version'] = version
    return next
  }
}
