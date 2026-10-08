/**
 * Re-exports the shared `MigrationError` for the milestone schema migrations
 * ([[T-ZRO1]]). The class itself now lives in a single home,
 * `lib/model/entities/_migration_error.ts`, shared by every entity type;
 * this file exists so `./vN-to-vN+1.ts` modules and their tests keep
 * importing it from `./errors.ts` unchanged.
 */
export { MigrationError } from '@lib/model/entities/_migration_error.ts'
