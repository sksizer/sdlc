/**
 * Pure-function transform from capability schema v2 to v3.
 *
 * v3 renames the entity-frontmatter lifecycle field `status` to
 * `state` — a hard cutover with no alias or dual-read (decision D-S30G's
 * "state" is an unrelated runtime lease-plane concept; this is the
 * entity-frontmatter lifecycle field). Same value, no other change, so the
 * whole transform is the shared
 * [`renameKeyMigration`](../../_rename_key_migration.ts) factory applied to
 * `"status" -> "state"` and `"3"` (the contract is documented there).
 *
 * Single-arg shape; not body-aware.
 */

import { renameKeyMigration } from '@lib/model/entities/_rename_key_migration.ts'

export type { Frontmatter } from '@lib/model/entities/_rename_key_migration.ts'

/** Raised when a v2 frontmatter cannot be mechanically migrated to v3. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v2 capability frontmatter object to v3.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = renameKeyMigration('status', 'state', '3', MigrationError)
