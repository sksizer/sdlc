/**
 * Body-aware transform from task schema v6 to v7.
 *
 * v7 relaxes the implementation-ready contract's touchpoint sections:
 *
 *   - `## Files to touch` (a `| Location | Kind | Change |` table, table-only,
 *     with a filesystem-existence disqualifier on `modify`/`delete` rows) is
 *     renamed to `## Areas` and reshaped to `| Area | Note |` — advisory,
 *     never resolved against the working tree. `Location` -> `Area`
 *     (verbatim), `Change` -> `Note` (verbatim), `Kind` is dropped: the
 *     new/modify/delete distinction stopped mattering once existence
 *     stopped being checked.
 *   - `## Today` becomes fully free-form prose (no more typed table, no more
 *     path-existence check). No table shape was ever REQUIRED of it, so an
 *     existing Today table is left byte-identical — it's already valid
 *     prose-or-table content under the relaxed contract. This transform
 *     never touches `## Today`.
 *
 * Reshaping `## Files to touch` is deterministic and unambiguous WHEN the
 * section is a well-formed 3-column table: every row's Location and Change
 * cells carry straight across, and Kind is simply discarded (there is no
 * inference to get wrong, unlike v2-to-v3's kind classification). The only
 * ambiguous case is a `## Files to touch` section that ISN'T a clean
 * 3-column table (bulleted-legacy, prose, or a malformed row count) — the
 * birth-floor contract never required table shape, so a `planning/*` task
 * could carry one of these. For that case the heading is still renamed, but
 * the body is left untouched below it and the row is flagged for triage via
 * the same `flagForTriage` helper `v2-to-v3.ts` uses (`definition_gap` +
 * status downshift, mid-flight preserved).
 *
 * That body rewrite only runs for OPEN tasks. `closed/*` tasks are
 * version-stamped ONLY — `migrate()` sets `schema_version: '7'` and returns
 * the body byte-identical, without ever calling the rewrite above — so a
 * closed v7 task may still carry the literal `## Files to touch` heading
 * verbatim. Only open tasks get the body reshape (heading rename, and the
 * table-row transform or triage flag described above).
 *
 * The entity migration runner introspects the signature and routes
 * two-positional-arg transforms through its body-aware dispatch path, so this
 * module exports the body-aware shape `migrate(fm, body) -> [new_fm, new_body]`
 * rather than the single-arg `migrate(fm) -> new_fm` the stamp-only transforms
 * keep (v3-to-v4.ts, v4-to-v5.ts, v5-to-v6.ts).
 */

import { isRecord } from '@lib/util/guards'
import { repr, typeName } from '@lib/util/diagnostics'

import { flagForTriage } from './_flag_for_triage.ts'
import { splitlinesKeepends, rstripNewline, matchH2 } from './_markdown_primitives.ts'

export type Frontmatter = Record<string, unknown>

/** Raised when a v6 frontmatter cannot be mechanically migrated to v7. */
import { MigrationError } from './errors.ts'
export { MigrationError }

const CLOSED_PREFIX = 'closed/'

// The one heading this transform reshapes. `TASK_BODY` (schema.ts) only ever
// declared the single spelling 'Files to touch' for this section — no alias
// list to walk, unlike v2-to-v3's Today aliases. Deliberately NOT sourced
// from `schema.ts`'s live `TASK_BODY` (which now names the section 'Areas'):
// a migration encodes the shape of a PAST version and must not track the
// current table forward.
const TARGET_HEADING = 'files to touch'
const NEW_HEADING = '## Areas'

const FENCE_RE = /^(```+|~~~+)/
const TABLE_ROW_RE = /^\s*\|/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/

/**
 * Split a `| a | b | c |` row into `['a','b','c']`. A minimal, non-escape-aware
 * split — sufficient here because this transform only ever re-emits Location
 * and Change cells verbatim (never re-parses their content), matching the
 * verbatim-cell handling `v2-to-v3.ts`'s render helpers use.
 */
function splitRow(stripped: string): string[] {
  let s = stripped.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

/**
 * Return true if the section opens with a `| header |` row immediately
 * followed by a `|---|` separator row (fence-aware). Mirrors `v2-to-v3.ts`'s
 * `looksLikeTable`, minus its 10-line lookahead cap (a Files-to-touch table
 * can legitimately run longer than 10 lines by 2026; a mis-shaped table still
 * falls through to the ambiguous-section path either way, just later).
 */
function looksLikeTable(sectionLines: string[]): boolean {
  let seenHeader = false
  let inFence = false
  let fenceMarker: string | null = null
  for (const rawLine of sectionLines) {
    const line = rstripNewline(rawLine)
    const fenceHit = FENCE_RE.exec(line)
    if (fenceHit) {
      const marker = fenceHit[1] as string
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker !== null && marker[0] === fenceMarker[0]) {
        inFence = false
        fenceMarker = null
      }
      continue
    }
    if (inFence) continue
    if (!line.trim()) continue
    const stripped = line.trim()
    if (stripped.startsWith('|')) {
      if (!seenHeader) {
        seenHeader = true
        continue
      }
      return TABLE_SEP_RE.test(stripped)
    }
    // Any non-blank, non-`|` line before a header is seen means this isn't a
    // table-opening section.
    if (!seenHeader) return false
  }
  return false
}

/**
 * Reshape a well-formed `| Location | Kind | Change |` table's data rows into
 * `| Area | Note |` rows. Returns [newLines, ambiguousReasons]. A row whose
 * cell count isn't exactly 3 aborts the WHOLE reshape (the section is left
 * untouched below the renamed heading) and returns one ambiguous reason
 * naming the offending row — reshaping some rows and leaving others would
 * silently corrupt the table's column count.
 */
function reshapeFilesToTouchTable(sectionLines: string[]): [string[], string[]] {
  const rendered: string[] = []
  const rows: Array<[string, string]> = []
  let seenHeader = false
  let seenSep = false
  let leadingBlank = 0

  for (const rawLine of sectionLines) {
    const line = rstripNewline(rawLine)
    if (FENCE_RE.test(line)) {
      // A fenced block inside a Files-to-touch table is not a shape this
      // transform has ever seen in practice; bail to the ambiguous path
      // rather than guess.
      return [sectionLines, [`Files-to-touch table contains a fenced block — review manually`]]
    }

    const stripped = line.trim()
    if (!stripped) {
      if (!seenHeader) leadingBlank += 1
      continue
    }
    if (!TABLE_ROW_RE.test(line)) {
      // Prose alongside the table (shouldn't happen in a well-formed
      // section, since `looksLikeTable` already gated on header+sep) — bail.
      return [sectionLines, [`Files-to-touch table has a non-table line: ${repr(stripped)}`]]
    }
    if (!seenHeader) {
      seenHeader = true
      continue
    }
    if (!seenSep) {
      if (!TABLE_SEP_RE.test(line)) {
        return [sectionLines, ['Files-to-touch table header is not followed by a separator row']]
      }
      seenSep = true
      continue
    }
    const cells = splitRow(stripped)
    if (cells.length !== 3) {
      return [
        sectionLines,
        [`Files-to-touch row has ${cells.length} cells, expected 3: ${repr(stripped)}`],
      ]
    }
    const location = cells[0] as string
    const change = cells[2] as string
    rows.push([location, change])
  }

  for (let i = 0; i < leadingBlank; i++) rendered.push('\n')
  rendered.push('| Area | Note |\n', '|---|---|\n')
  for (const [area, note] of rows) {
    const noteCell = note.replace(/\|/g, '\\|')
    rendered.push(`| ${area} | ${noteCell} |\n`)
  }
  const last = sectionLines[sectionLines.length - 1]
  if (sectionLines.length > 0 && last !== undefined && last.endsWith('\n') && last.trim() === '') {
    rendered.push('\n')
  }
  return [rendered, []]
}

/**
 * Rewrite `## Files to touch` -> `## Areas` across the body, reshaping a
 * well-formed table's rows and flagging anything else for triage. `## Today`
 * is untouched — v7 imposes no shape on it, so any existing content (table
 * or prose) is already valid.
 */
function rewriteBody(body: string): [string, string[]] {
  const lines = splitlinesKeepends(body)
  const outLines: string[] = []
  let i = 0
  const reasons: string[] = []

  while (i < lines.length) {
    const line = lines[i] as string
    const h2 = matchH2(line)
    if (h2 === null || h2.toLowerCase() !== TARGET_HEADING) {
      outLines.push(line)
      i += 1
      continue
    }

    // Found `## Files to touch`. Slurp until the next H2 or EOF, rename the
    // heading, and reshape (or flag) the section body.
    i += 1
    const sectionLines: string[] = []
    while (i < lines.length) {
      if (matchH2(lines[i] as string) !== null) break
      sectionLines.push(lines[i] as string)
      i += 1
    }

    outLines.push(NEW_HEADING + '\n')
    if (looksLikeTable(sectionLines)) {
      const [rewritten, sectionReasons] = reshapeFilesToTouchTable(sectionLines)
      if (sectionReasons.length > 0) {
        reasons.push(...sectionReasons.map((r) => `Areas (renamed from Files to touch): ${r}`))
      }
      outLines.push(...rewritten)
    } else {
      // Not a well-formed table (prose, bulleted-legacy, or empty) — the
      // birth-floor never required a table shape, so this is expected for a
      // still-in-planning task. Keep the content, flag for a human to
      // reshape into the v7 `| Area | Note |` convention if they want the
      // structured form.
      outLines.push(...sectionLines)
      const hasContent = sectionLines.some((l) => l.trim().length > 0)
      if (hasContent) {
        reasons.push(
          'Files to touch (renamed to Areas) was not a well-formed 3-column table — ' +
            'content preserved verbatim under the new heading; reshape into `| Area | Note |` ' +
            'by hand if desired (no longer required)',
        )
      }
    }
  }

  return [outLines.join(''), reasons]
}

/**
 * Migrate a v6 task (frontmatter + body) to v7.
 *
 * Returns `[newFm, newBody]`. Inputs are not mutated.
 */
export function migrate(fm: Frontmatter, body: string): [Frontmatter, string] {
  if (!isRecord(fm)) {
    throw new MigrationError(`frontmatter must be a mapping, got ${typeName(fm)}`)
  }
  if (typeof body !== 'string') {
    throw new MigrationError(`body must be a string, got ${typeName(body)}`)
  }

  const newFm: Frontmatter = { ...fm }
  // Closed tasks are not body-migrated — stamp the version, skip rewriting.
  const status = newFm['status']
  if (typeof status === 'string' && status.startsWith(CLOSED_PREFIX)) {
    newFm['schema_version'] = '7'
    return [newFm, body]
  }

  const [newBody, ambiguousReasons] = rewriteBody(body)
  newFm['schema_version'] = '7'

  if (ambiguousReasons.length > 0) {
    flagForTriage(
      newFm,
      'v6-to-v7 migration flagged ambiguous Files-to-touch section(s)',
      ambiguousReasons,
    )
  }

  return [newFm, newBody]
}
