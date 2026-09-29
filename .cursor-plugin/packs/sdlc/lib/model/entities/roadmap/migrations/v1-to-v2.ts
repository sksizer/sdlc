/**
 * Pure-function transform from roadmap schema v1 to v2.
 *
 * v2 renames the entity-frontmatter lifecycle field `status` to
 * `state` — a hard cutover with no alias or dual-read (decision D-S30G's
 * "state" is an unrelated runtime lease-plane concept; this is the
 * entity-frontmatter lifecycle field). Same value, no other change, so the
 * whole transform is the shared
 * [`renameKeyMigration`](../../_rename_key_migration.ts) factory applied to
 * `"status" -> "state"` and `"2"` (the contract is documented there).
 *
 * Single-arg shape; not body-aware.
 */

import { renameKeyMigration } from '@lib/model/entities/_rename_key_migration.ts'

export type { Frontmatter } from '@lib/model/entities/_rename_key_migration.ts'

/** Raised when a v1 frontmatter cannot be mechanically migrated to v2. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v1 roadmap frontmatter object to v2.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = renameKeyMigration('status', 'state', '2', MigrationError)
