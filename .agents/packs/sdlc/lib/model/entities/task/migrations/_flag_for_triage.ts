/**
 * Shared "flag for triage" helper for body-reshaping task migrations.
 *
 * When a transform can't mechanically resolve every row/section it touches
 * (an ambiguous v2 Files-to-touch row's kind, a v6 Files-to-touch section
 * that isn't a well-formed table to reshape into v7's Areas shape, ...), it
 * records a `definition_gap` naming what's ambiguous and downshifts
 * `status:` to `planning/needs-definition` — UNLESS the task is already
 * `in-progress` / `in-progress/blocked`, in which case status is preserved
 * (the task is mid-flight; downshifting would corrupt task-work state, same
 * carve-out `implementation-ready.md` documents for the readiness gate).
 * `readiness_verified_at:` is always cleared: an ambiguous migration means
 * the spec's shape changed under it, so any prior verification is stale.
 *
 * Originally private to `v2-to-v3.ts`; lifted here so `v6-to-v7.ts` (and any
 * future body-reshaping transform) shares the exact same triage semantics
 * instead of re-deriving them.
 */

export type Frontmatter = Record<string, unknown>

const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set(['in-progress', 'in-progress/blocked'])
const DOWNSHIFT_STATUS = 'planning/needs-definition'

/**
 * In-place: append to (or set) `definition_gap`, downshift `status` unless
 * in-progress, clear `readiness_verified_at`.
 *
 * @param gapPrefix Names the migration that flagged the gap (e.g.
 *   `v2-to-v3 migration flagged ambiguous touchpoint row(s)`), so a corpus
 *   carrying gaps from more than one migration stays attributable.
 */
export function flagForTriage(fm: Frontmatter, gapPrefix: string, reasons: string[]): void {
  const gapExisting = fm['definition_gap']
  const gapNew = `${gapPrefix}: ${reasons.join('; ')}`
  if (typeof gapExisting === 'string' && gapExisting.trim()) {
    fm['definition_gap'] = `${gapExisting.trim()} | ${gapNew}`
  } else {
    fm['definition_gap'] = gapNew
  }

  const currentStatus = fm['status']
  if (typeof currentStatus !== 'string' || !IN_PROGRESS_STATUSES.has(currentStatus)) {
    fm['status'] = DOWNSHIFT_STATUS
  }
  delete fm['readiness_verified_at']
}
