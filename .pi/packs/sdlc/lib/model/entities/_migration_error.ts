/**
 * Shared error for every entity type's schema migrations.
 *
 * Every `vN-to-vN+1` migration throws `MigrationError` for input it cannot
 * mechanically migrate (non-object frontmatter, unrecognized enum values, and
 * the like). It used to live as a byte-identical private copy in each entity
 * type's own `migrations/errors.ts`; this is the single home ([[T-ZRO1]]).
 * Each type's `errors.ts` re-exports it, so callers and tests keep importing
 * it from `./errors.ts` / `./vN-to-vN+1.ts` as before — no call sites moved.
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}
