/**
 * Shared generic markdown/string primitives for body-reshaping task
 * migrations. These are pure ports of Python stdlib string behavior plus one
 * H2-header matcher — none of it is schema- or version-specific, unlike each
 * transform's own heading tables / column grammars, which stay local to that
 * transform on purpose (a migration encodes the shape of a PAST version and
 * must not track the current schema forward).
 *
 * Originally private, byte-for-byte duplicated between `v2-to-v3.ts` and
 * `v6-to-v7.ts`; lifted here so both (and any future body-reshaping
 * transform) share one implementation, mirroring how `_flag_for_triage.ts`
 * already shares `flagForTriage` between these same two files.
 */

/**
 * Faithful port of Python's str.splitlines(keepends=True).
 *
 * Splits on \n, \r, and \r\n boundaries, keeping the line terminator on
 * each chunk. Trailing content without a terminator becomes a final chunk.
 */
export function splitlinesKeepends(text: string): string[] {
  const out: string[] = []
  let start = 0
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === '\n') {
      out.push(text.slice(start, i + 1))
      i += 1
      start = i
    } else if (ch === '\r') {
      if (i + 1 < n && text[i + 1] === '\n') {
        out.push(text.slice(start, i + 2))
        i += 2
      } else {
        out.push(text.slice(start, i + 1))
        i += 1
      }
      start = i
    } else {
      i += 1
    }
  }
  if (start < n) {
    out.push(text.slice(start))
  }
  return out
}

/**
 * Port of Python's str.rstrip() (strip trailing ASCII/Unicode whitespace).
 */
export function pyRstrip(s: string): string {
  return s.replace(/\s+$/u, '')
}

/** Port of Python's str.rstrip("\n"). */
export function rstripNewline(s: string): string {
  return s.replace(/\n+$/, '')
}

/**
 * If `line` is an H2 header, return its title text (no trailing whitespace,
 * no leading `## `). Otherwise return null.
 */
export function matchH2(line: string): string | null {
  const stripped = pyRstrip(rstripNewline(line))
  if (!stripped.startsWith('## ')) {
    return null
  }
  if (stripped.startsWith('### ')) {
    return null
  }
  return stripped.slice(3).trim()
}
