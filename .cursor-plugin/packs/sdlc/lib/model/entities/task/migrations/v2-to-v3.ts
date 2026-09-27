/**
 * Body-aware transform from task schema v2 to v3.
 *
 * v3 restructures the `## Today` and `## Files to touch` sections from
 * free-form prose / bulleted lists into typed markdown tables that share
 * a five-form Location grammar (file, file+symbol, file+line, directory,
 * glob).
 *
 * The entity migration runner introspects the signature and routes
 * two-positional-arg transforms through its body-aware dispatch path, so this
 * module exports the body-aware shape `migrate(fm, body) -> [new_fm, new_body]`
 * rather than the single-arg `migrate(fm) -> new_fm` the other transforms keep.
 */

import { isRecord } from '@lib/util/guards'
import { repr, typeName } from '@lib/util/diagnostics'

import { flagForTriage } from './_flag_for_triage.ts'
import { splitlinesKeepends, rstripNewline, matchH2 } from './_markdown_primitives.ts'

export type Frontmatter = Record<string, unknown>

/** Raised when a v2 frontmatter cannot be mechanically migrated to v3. */
import { MigrationError } from './errors.ts'
export { MigrationError }

const CLOSED_PREFIX = 'closed/'

// H2 headings we care about. Match case-insensitively; the canonical
// section name is the map value.
const TARGET_SECTIONS: Record<string, string> = {
  today: 'Today',
  'current state': 'Today',
  'today / current state': 'Today',
  'files to touch': 'Files to touch',
}

// Row-note language that means "this is a new file" — sets `kind: new`.
const NEW_HINT_RE = /\b(new|new file|new module|create)\b/i

// Row-note language that signals a deletion. Flagged for human triage.
const AMBIGUOUS_HINT_RE = /\b(remove|delete|drop|rename|rip out|tear out)\b/i

// Look for a path-shaped token in a row body: a backticked token, a path
// with slashes, or a recognised dot-extension.
const PATH_HINT_RE =
  /`[^`]+`|\b[\w\-.]+\/[\w\-./]+\b|\b[\w\-.]+\.(?:py|rs|ts|tsx|vue|js|md|toml|json|sql|sh|yaml|yml)\b/

// Bullet-list row matcher.
const BULLET_RE = /^[ \t]*[-*]\s+(.*)$/

// Em-dash / hyphen separator between location and note. Split on the
// FIRST occurrence.
const SEPARATOR_RE = /\s+(?:—|–|--?)\s+/

/**
 * Migrate a v2 task (frontmatter + body) to v3.
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
    newFm['schema_version'] = '3'
    return [newFm, body]
  }

  const [newBody, ambiguousReasons] = rewriteBody(body)
  newFm['schema_version'] = '3'

  if (ambiguousReasons.length > 0) {
    flagForTriage(newFm, 'v2-to-v3 migration flagged ambiguous touchpoint row(s)', ambiguousReasons)
  }

  return [newFm, newBody]
}

// ---------- body parsing ----------

function rewriteBody(body: string): [string, string[]] {
  const lines = splitlinesKeepends(body)
  const outLines: string[] = []
  let i = 0
  const reasons: string[] = []

  while (i < lines.length) {
    const line = lines[i] as string
    const h2 = matchH2(line)
    if (h2 === null) {
      outLines.push(line)
      i += 1
      continue
    }

    const canonical = TARGET_SECTIONS[h2.toLowerCase()]
    if (canonical === undefined) {
      outLines.push(line)
      i += 1
      continue
    }

    // Found a target section. Slurp until the next H2 or EOF.
    const sectionStart = i
    i += 1
    const sectionLines: string[] = []
    while (i < lines.length) {
      if (matchH2(lines[i] as string) !== null) {
        break
      }
      sectionLines.push(lines[i] as string)
      i += 1
    }

    outLines.push(lines[sectionStart] as string) // H2 header itself
    if (canonical === 'Files to touch') {
      const [rewritten, sectionReasons] = rewriteFilesToTouch(sectionLines)
      reasons.push(...sectionReasons)
      outLines.push(...rewritten)
    } else {
      // canonical === "Today"
      const [rewritten, sectionReasons] = rewriteToday(sectionLines)
      reasons.push(...sectionReasons)
      outLines.push(...rewritten)
    }
  }

  return [outLines.join(''), reasons]
}

/** Return the bullet's body text, or null if `line` is not a bullet row. */
function parseBullet(line: string): string | null {
  const m = BULLET_RE.exec(rstripNewline(line))
  if (!m) {
    return null
  }
  return (m[1] as string).trim()
}

/**
 * Split a bulleted-row body into [location, note].
 */
function splitLocationAndNote(bodyText: string): [string, string] {
  // re.split with maxsplit=1: split on the first separator only.
  const m = SEPARATOR_RE.exec(bodyText)
  if (m && m.index !== undefined) {
    const before = bodyText.slice(0, m.index)
    const after = bodyText.slice(m.index + m[0].length)
    return [before.trim(), after.trim()]
  }

  // Backticked prefix.
  const stripped = bodyText.replace(/^\s+/u, '')
  if (stripped.startsWith('`')) {
    const close = stripped.indexOf('`', 1)
    if (close > 0) {
      const locationToken = stripped.slice(0, close + 1)
      const note = stripped.slice(close + 1).trim()
      if (note) {
        return [locationToken.trim(), note]
      }
    }
  }

  return [bodyText.trim(), '']
}

/**
 * Strip surrounding backticks / parentheses from a location token.
 */
function stripLocationDecor(location: string): string {
  let text = location.trim()
  // Drop trailing parentheticals like `(new)`, `(deprecated)`, etc.
  text = text.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // Strip a single set of surrounding backticks if balanced.
  if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
    text = text.slice(1, -1).trim()
  }
  return text
}

/**
 * Determine the row's Kind and (optionally) an ambiguity diagnosis.
 *
 * Returns [kind, ambiguousReason]. When `ambiguousReason` is not null,
 * the caller appends it to the migration's definition_gap.
 */
function classifyKind(note: string, location: string): [string, string | null] {
  let locationParen = ''
  const m = /\(([^)]*)\)/.exec(location)
  if (m) {
    locationParen = m[1] as string
  }

  const combined = `${locationParen} ${note}`

  if (NEW_HINT_RE.test(combined)) {
    return ['new', null]
  }

  const ambiguousMatch = AMBIGUOUS_HINT_RE.exec(combined)
  if (ambiguousMatch) {
    // Python: f"...({_AMBIGUOUS_HINT_RE.search(combined).group(0)!r})..."
    // repr() of the matched substring (a str) → single-quoted.
    return [
      'modify',
      `row \`${location}\` carries removal/rename language ` +
        `('${ambiguousMatch[0]}') — ` +
        `v3 kind cannot be inferred mechanically`,
    ]
  }

  return ['modify', null]
}

/**
 * Convert a bulleted Files-to-touch block to a typed table.
 *
 * Returns [newLines, ambiguousReasons].
 */
function rewriteFilesToTouch(sectionLines: string[]): [string[], string[]] {
  if (looksLikeTable(sectionLines)) {
    return [sectionLines, []]
  }

  const rows: Array<[string, string, string]> = [] // (location, kind, change)
  const reasons: string[] = []
  let sawAnyBullet = false

  let inFence = false
  let fenceMarker: string | null = null

  for (const rawLine of sectionLines) {
    const line = rstripNewline(rawLine)

    const fenceHit = /^(```+|~~~+)/.exec(line)
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
    if (inFence) {
      continue
    }

    const bullet = parseBullet(rawLine)
    if (bullet === null) {
      continue
    }
    sawAnyBullet = true
    if (!PATH_HINT_RE.test(bullet)) {
      reasons.push(`Files-to-touch row has no path-shaped token: ${repr(bullet)}`)
      continue
    }

    const [locationRaw, note] = splitLocationAndNote(bullet)
    const location = stripLocationDecor(locationRaw)
    const [kind, reason] = classifyKind(note, locationRaw)
    if (reason !== null) {
      reasons.push(reason)
    }
    const change = note ? note : '<migrated from v2 — no note recorded>'
    rows.push([location, kind, change])
  }

  if (!sawAnyBullet) {
    reasons.push('Files-to-touch section had no bulleted rows to convert')
    return [sectionLines, reasons]
  }

  const tableLines = renderFilesToTouchTable(rows)
  // Preserve a trailing blank line if the original section ended in one.
  const last = sectionLines[sectionLines.length - 1]
  if (sectionLines.length > 0 && last !== undefined && last.endsWith('\n') && last.trim() === '') {
    tableLines.push('\n')
  }
  return [tableLines, reasons]
}

/** Return True if the section already opens with a markdown table. */
function looksLikeTable(sectionLines: string[]): boolean {
  let seenHeader = false
  let seenSep = false
  let count = 0
  let inFence = false
  let fenceMarker: string | null = null
  for (const rawLine of sectionLines) {
    const line = rstripNewline(rawLine)
    const fenceHit = /^(```+|~~~+)/.exec(line)
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
    if (inFence) {
      continue
    }
    if (!line.trim()) {
      continue
    }
    count += 1
    if (count > 10) {
      break
    }
    const stripped = line.trim()
    if (stripped.startsWith('|')) {
      if (!seenHeader) {
        seenHeader = true
        continue
      }
      if (/\|[\s:|-]+\|/.test(stripped)) {
        seenSep = true
        break
      }
    }
  }
  return seenHeader && seenSep
}

/** Render the v3 Files-to-touch table from extracted rows. */
function renderFilesToTouchTable(rows: Array<[string, string, string]>): string[] {
  const lines: string[] = ['\n', '| Location | Kind | Change |\n', '|---|---|---|\n']
  for (const [location, kind, change] of rows) {
    const locCell = location.startsWith('`') ? location : `\`${location}\``
    const changeCell = change.replace(/\|/g, '\\|')
    lines.push(`| ${locCell} | ${kind} | ${changeCell} |\n`)
  }
  lines.push('\n')
  return lines
}

// ---------- Today rewriting ----------

/**
 * Convert a path-bearing Today section to a `| Location | Role today |`
 * table. Pure-narrative Today is returned unchanged.
 */
function rewriteToday(sectionLines: string[]): [string[], string[]] {
  if (looksLikeTable(sectionLines)) {
    return [sectionLines, []]
  }

  const rows: Array<[string, string]> = [] // (location, role)
  let sawAnyPathBullet = false
  let inFence = false
  let fenceMarker: string | null = null

  for (const rawLine of sectionLines) {
    const line = rstripNewline(rawLine)
    const fenceHit = /^(```+|~~~+)/.exec(line)
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
    if (inFence) {
      continue
    }

    const bullet = parseBullet(rawLine)
    if (bullet === null) {
      continue
    }

    if (!PATH_HINT_RE.test(bullet)) {
      continue
    }

    sawAnyPathBullet = true
    const [locationRaw, note] = splitLocationAndNote(bullet)
    const location = stripLocationDecor(locationRaw)
    const role = note ? note : '<migrated from v2 — no role recorded>'
    rows.push([location, role])
  }

  if (!sawAnyPathBullet) {
    return [sectionLines, []]
  }

  const tableLines = renderTodayTable(rows)
  const last = sectionLines[sectionLines.length - 1]
  if (sectionLines.length > 0 && last !== undefined && last.endsWith('\n') && last.trim() === '') {
    tableLines.push('\n')
  }
  return [tableLines, []]
}

function renderTodayTable(rows: Array<[string, string]>): string[] {
  const lines: string[] = ['\n', '| Location | Role today |\n', '|---|---|\n']
  for (const [location, role] of rows) {
    const locCell = location.startsWith('`') ? location : `\`${location}\``
    const roleCell = role.replace(/\|/g, '\\|')
    lines.push(`| ${locCell} | ${roleCell} |\n`)
  }
  lines.push('\n')
  return lines
}
