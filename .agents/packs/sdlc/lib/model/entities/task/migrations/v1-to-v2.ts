/**
 * Pure-function transform from task schema v1 to v2.
 *
 * Consumes a parsed-frontmatter object (the result of YAML.parse on the
 * file's frontmatter block) and returns a new object carrying the migrated
 * shape. No I/O — callers own reading/writing the file.
 *
 * Contract:
 *
 *   - Returns a *new* object; the input is not mutated.
 *   - Stamps `schema_version: "2"` on the result (string-typed to match
 *     the schema's `type: string` declaration).
 *   - For bare-`closed` with `resolution`, infers the new `closed/<reason>`
 *     status from `resolution` and drops `resolution`, `resolution_date`,
 *     `resolution_commit`. If `completion_note` is absent, synthesizes one
 *     from `resolution_commit` ("Resolved in <hash>").
 *   - For other legacy bare statuses, maps to the appropriate
 *     `closed/<reason>` and synthesizes a `completion_note` if missing
 *     ("Migrated from bare `<old>` status").
 *   - Statuses already in the v2 enum pass through unchanged (other than
 *     the schema_version stamp).
 *   - Throws `MigrationError` for unrecognized statuses or for bare-`closed`
 *     without a `resolution` field.
 *
 * Export shape matches the entity migration loader convention: a single-arg
 * `migrate(fm) -> new_fm` callable (the frontmatter-only contract).
 */

import { isRecord } from '@lib/util/guards'
import { repr, typeName } from '@lib/util/diagnostics'

export type Frontmatter = Record<string, unknown>

/** Raised when a v1 frontmatter cannot be mechanically migrated to v2. */
import { MigrationError } from './errors.ts'
export { MigrationError }

// Direct renames where the new status is structurally the same row.
const DIRECT_RENAMES: Record<string, string> = {
  draft: 'planning/draft',
  proposed: 'planning/proposed',
  'proposed/needs-definition': 'planning/needs-definition',
  backlog: 'planning/backlog',
  ready: 'open/ready',
  // `open` bare-legacy collapses to planning/proposed (best-guess default).
  open: 'planning/proposed',
}

// v2 values that already exist and pass through unchanged.
const V2_PASSTHROUGH: ReadonlySet<string> = new Set([
  'planning/draft',
  'planning/proposed',
  'planning/needs-definition',
  'planning/backlog',
  'open/ready',
  'in-progress',
  'in-progress/blocked',
  'closed/done',
  'closed/superseded',
  'closed/partially-superseded',
  'closed/obsoleted',
  'closed/relocated',
  'closed/no-repro',
  'closed/wontdo',
])

// Legacy bare-closed remappings driven by the `resolution` field.
const RESOLUTION_TO_CLOSED: Record<string, string> = {
  fixed: 'closed/done',
  wontfix: 'closed/wontdo',
  superseded: 'closed/superseded',
  obsoleted: 'closed/obsoleted',
}

// Legacy bare statuses (no `resolution` field) that collapse straight
// into a closed/<reason> state. completion_note synthesis applies.
const LEGACY_BARE_TO_CLOSED: Record<string, string> = {
  done: 'closed/done',
  superseded: 'closed/superseded',
  'partially-superseded': 'closed/partially-superseded',
  'relocated-upstream': 'closed/relocated',
  'investigated-no-repro': 'closed/no-repro',
}

/**
 * Migrate a v1 task frontmatter object to v2.
 *
 * Returns a new object; does not mutate `fm`.
 */
export function migrate(fm: Frontmatter): Frontmatter {
  if (!isRecord(fm)) {
    throw new MigrationError(`frontmatter must be a mapping, got ${typeName(fm)}`)
  }

  // Work on a shallow copy so the caller's object stays untouched.
  let next: Frontmatter = { ...fm }

  const status = next['status']
  if (typeof status !== 'string') {
    throw new MigrationError(`status must be a string, got ${typeName(status)}: ${repr(status)}`)
  }

  if (status === 'closed') {
    next = migrateBareClosed(next)
  } else if (Object.prototype.hasOwnProperty.call(LEGACY_BARE_TO_CLOSED, status)) {
    const newStatus = LEGACY_BARE_TO_CLOSED[status] as string
    next['status'] = newStatus
    if (!Object.prototype.hasOwnProperty.call(next, 'completion_note')) {
      next['completion_note'] = `Migrated from bare \`${status}\` status`
    }
  } else if (Object.prototype.hasOwnProperty.call(DIRECT_RENAMES, status)) {
    next['status'] = DIRECT_RENAMES[status] as string
  } else if (V2_PASSTHROUGH.has(status)) {
    // Already canonical — nothing to do beyond schema_version stamp.
  } else {
    throw new MigrationError(`unrecognised v1 status ${repr(status)}; cannot migrate to v2`)
  }

  next['schema_version'] = '2'
  return next
}

/**
 * Handle the bare-closed-with-resolution case.
 *
 * Mutates and returns the passed object (the caller has already made a
 * shallow copy).
 */
function migrateBareClosed(fm: Frontmatter): Frontmatter {
  const resolution = fm['resolution']
  if (
    typeof resolution !== 'string' ||
    !Object.prototype.hasOwnProperty.call(RESOLUTION_TO_CLOSED, resolution)
  ) {
    const known = Object.keys(RESOLUTION_TO_CLOSED).sort()
    throw new MigrationError(
      `bare "closed" status requires a known resolution ` +
        `(one of ${repr(known)}); got ${repr(resolution)}`,
    )
  }

  fm['status'] = RESOLUTION_TO_CLOSED[resolution] as string

  // Synthesize completion_note from resolution_commit if missing.
  if (!Object.prototype.hasOwnProperty.call(fm, 'completion_note')) {
    const commit = fm['resolution_commit']
    if (typeof commit === 'string' && commit) {
      fm['completion_note'] = `Resolved in ${commit}`
    } else {
      fm['completion_note'] = `Migrated from bare \`closed\` status (resolution: ${resolution})`
    }
  }

  // Drop the legacy resolution_* triple.
  for (const key of ['resolution', 'resolution_date', 'resolution_commit']) {
    delete fm[key]
  }

  return fm
}
