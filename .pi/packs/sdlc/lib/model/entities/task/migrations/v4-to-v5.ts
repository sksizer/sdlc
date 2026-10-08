/**
 * Pure-function transform from task schema v4 to v5.
 *
 * v5 declares an optional `priority: boolean` field used by
 * `sdlc task next` as the highest-weight sort key. No frontmatter values
 * move and no body content changes — this is a stamp-only migration, so the
 * whole transform is [`_stamp_only.ts`](./_stamp_only.ts)'s factory applied to
 * `"5"` (the contract is documented there). Tasks that don't set `priority:`
 * are treated as `priority: false` by the sort.
 *
 * Single-arg shape (like v3-to-v4.ts); not body-aware.
 */

import { stampOnlyMigration } from './_stamp_only.ts'

export type { Frontmatter } from './_stamp_only.ts'

/** Raised when a v4 frontmatter cannot be mechanically migrated to v5. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v4 task frontmatter object to v5.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = stampOnlyMigration('5')
