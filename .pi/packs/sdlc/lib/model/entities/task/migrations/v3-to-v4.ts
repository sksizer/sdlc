/**
 * Pure-function transform from task schema v3 to v4.
 *
 * v4 declares an optional `prs:` array of PR URLs and tightens the
 * `status:` field description. No frontmatter values move and no body
 * content changes — this is a stamp-only migration, so the whole transform is
 * [`_stamp_only.ts`](./_stamp_only.ts)'s factory applied to `"4"`; the
 * contract (new object, string-typed stamp, idempotent, `MigrationError` on
 * non-object input) is documented there.
 *
 * Single-arg shape (like v1-to-v2.ts); not body-aware.
 */

import { stampOnlyMigration } from './_stamp_only.ts'

export type { Frontmatter } from './_stamp_only.ts'

/** Raised when a v3 frontmatter cannot be mechanically migrated to v4. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v3 task frontmatter object to v4.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = stampOnlyMigration('4')
