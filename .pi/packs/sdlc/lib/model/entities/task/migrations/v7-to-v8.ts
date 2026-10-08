/**
 * Pure-function transform from task schema v7 to v8.
 *
 * v8 declares one optional field — `issue` (the linked GitHub issue's bare
 * decimal number, e.g. `"1234"`) — per
 * [[D-0019-sdlc-chain-stages-and-labels]] / [[T-3YQO]]. Nothing on disk
 * carries it yet; it is set going forward by
 * `lib/services/issues/link.ts#ensureLinkedTask` when an issue enters the
 * `define` chain stage.
 *
 * No frontmatter values move and no body content changes — every v7 instance
 * is already valid under v8 — so the whole transform is
 * [`_stamp_only.ts`](./_stamp_only.ts)'s factory applied to `"8"` (the
 * contract is documented there).
 *
 * Single-arg shape (like v4-to-v5.ts / v5-to-v6.ts); not body-aware.
 */

import { stampOnlyMigration } from './_stamp_only.ts'

export type { Frontmatter } from './_stamp_only.ts'

/** Raised when a v7 frontmatter cannot be mechanically migrated to v8. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v7 task frontmatter object to v8.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = stampOnlyMigration('8')
