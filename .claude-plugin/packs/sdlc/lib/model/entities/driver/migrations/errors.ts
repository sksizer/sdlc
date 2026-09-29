/**
 * Shared error for the driver schema migrations.
 *
 * Every `vN-to-vN+1` migration throws `MigrationError` for input it cannot
 * mechanically migrate (non-object frontmatter, and the like). Mirrors the
 * task/capability migrations' `errors.ts`; each migration module re-exports
 * it so callers and tests keep importing from `./vN-to-vN+1.ts`.
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}
