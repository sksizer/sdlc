/**
 * Shared error for the capability schema migrations.
 *
 * Every `vN-to-vN+1` migration throws `MigrationError` for input it cannot
 * mechanically migrate (non-object frontmatter, unrecognized enum values, a
 * `contains` list inconsistent with the children's `parent_key`). Mirrors the
 * task migrations' `errors.ts`; each migration module re-exports it so callers
 * and tests keep importing from `./vN-to-vN+1.ts`.
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}
