/**
 * Pure-function transform from task schema v8 to v9.
 *
 * v9 renames the entity-frontmatter lifecycle field `status` to
 * `state` — a hard cutover with no alias or dual-read (decision D-S30G's
 * "state" is an unrelated runtime lease-plane concept; this is the
 * entity-frontmatter lifecycle field). Same value, no other change, so the
 * whole transform is the shared
 * [`renameKeyMigration`](../../_rename_key_migration.ts) factory applied to
 * `"status" -> "state"` and `"9"` (the contract is documented there).
 *
 * Single-arg shape; not body-aware.
 */

import { renameKeyMigration } from '@lib/model/entities/_rename_key_migration.ts'

export type { Frontmatter } from '@lib/model/entities/_rename_key_migration.ts'

/** Raised when a v8 frontmatter cannot be mechanically migrated to v9. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v8 task frontmatter object to v9.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = renameKeyMigration('status', 'state', '9', MigrationError)
