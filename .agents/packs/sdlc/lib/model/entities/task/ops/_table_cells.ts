/**
 * The escape-aware markdown table-row cell split shared by the task-document
 * ops that read tables out of a task body (`parse-touchpoints`,
 * `scan-placeholders`).
 *
 * Underscore-prefixed to match the directory's `_task_doc.ts` /
 * `_probe_core.ts` convention — it carries no op descriptor, so the registry's
 * discovery walk must not treat it as an op.
 *
 * Deliberately NOT markdown-contract's `rawTableRow`: that helper's `splitRow`
 * is scoped to the Operations-table parser and is not escape-aware, so it would
 * change cell text for rows containing an escaped `\|`.
 */

/** Sentinel standing in for an escaped `\|` while the row is split on `|`. */
const PIPE_PLACEHOLDER = '\x00PIPE\x00'

/**
 * Split a `| a | b | c |` row into `['a','b','c']`.
 *
 * `\|` is an escaped literal pipe, not a cell boundary: it is swapped for a
 * sentinel before the split and restored (unescaped) in each trimmed cell.
 * Leading and trailing row pipes are dropped so they do not yield empty edge
 * cells. `stripped` is expected to be already trimmed of surrounding
 * whitespace.
 */
export function splitTableRow(stripped: string): string[] {
  let s = stripped.split('\\|').join(PIPE_PLACEHOLDER)
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim().split(PIPE_PLACEHOLDER).join('|'))
}
