/**
 * Shared error for the task schema migrations.
 *
 * Every `vN-to-vN+1` migration throws `MigrationError` for malformed input
 * (non-object frontmatter, unrecognized enum values, and the like). It lived
 * as a byte-identical private copy in each migration module; this is the
 * single home. Each module re-exports it, so callers and tests keep importing
 * it from `./vN-to-vN+1.ts`.
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}
