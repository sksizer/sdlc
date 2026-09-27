/**
 * Pure-function transform from task schema v5 to v6.
 *
 * v6 declares two optional work-order payload fields —
 * `scope` (a pattern set plus its enforcement tier) and `scheduling` (the
 * concurrency class, a not-before instant, a recurrence hint) — per
 * [[D-VSLI-distributed-work-runner-architecture]] §Scope claims / §Scheduling.
 * Nothing writes either field yet — the version landed ahead of its readers so
 * the corpus already carries it when one arrives.
 *
 * No frontmatter values move and no body content changes — every v5 instance is
 * already valid under v6 — so the whole transform is
 * [`_stamp_only.ts`](./_stamp_only.ts)'s factory applied to `"6"` (the contract
 * is documented there).
 *
 * Single-arg shape (like v4-to-v5.ts); not body-aware.
 */

import { stampOnlyMigration } from './_stamp_only.ts'

export type { Frontmatter } from './_stamp_only.ts'

/** Raised when a v5 frontmatter cannot be mechanically migrated to v6. */
import { MigrationError } from './errors.ts'
export { MigrationError }

/**
 * Migrate a v5 task frontmatter object to v6.
 *
 * Returns a new object; does not mutate `fm`.
 */
export const migrate = stampOnlyMigration('6')
