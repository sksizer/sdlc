/** Rows by columns as a grid on the left; one section per row listing its cells. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { CellState, MatrixBlock } from './types.ts'
import { parts, table } from '../lib/markdown.ts'

const STATES: CellState[] = ['valid', 'warn', 'error', 'skip']
const GLYPH: Record<CellState, string> = { valid: '✓', warn: '!', error: '✕', skip: '–' }

function cellMap(b: MatrixBlock) {
  const m = new Map<string, MatrixBlock['cells'][number]>()
  for (const c of b.cells) m.set(`${c.row}\u0000${c.col}`, c)
  return m
}

export function render(b: MatrixBlock): BlockOut {
  const cells = cellMap(b)
  const dflt = b.default ?? 'skip'
  const at = (r: string, c: string) =>
    cells.get(`${r}\u0000${c}`) ?? { row: r, col: c, state: dflt }
  const head = `<tr><th class="corner">${b.rowLabel || b.colLabel ? `${escapeHtml(b.rowLabel ?? '')}${b.rowLabel && b.colLabel ? ' \\ ' : ''}${escapeHtml(b.colLabel ?? '')}` : ''}</th>${b.cols.map((c) => `<th class="ch" data-node="${escapeHtml(c.id)}" title="${escapeHtml(c.detail ?? '')}">${escapeHtml(c.label)}</th>`).join('')}</tr>`
  const body = b.rows
    .map(
      (r) =>
        `<tr data-node="${escapeHtml(r.id)}"><th class="rh">${escapeHtml(r.label)}</th>${b.cols
          .map((c) => {
            const cell = at(r.id, c.id)
            const tip = [cell.note, cell.hint ? `→ ${cell.hint}` : ''].filter(Boolean).join(' ')
            return `<td class="cell ${cell.state}" title="${escapeHtml(`${r.label} × ${c.label}: ${cell.state}${tip ? '. ' + tip : ''}`)}">${GLYPH[cell.state]}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')
  const legend = `<div class="legend">${STATES.map((s) => `<span class="chip st-${s}">${GLYPH[s]} ${s}</span>`).join('')}</div>`
  const left = `<div class="matrix-wrap"><table class="matrix">${head}${body}</table>${legend}</div>`
  const sections = b.rows.map((r, i) => ({
    id: r.id,
    n: i + 1,
    title: r.label,
    source: r.source,
    html: `<h2>${i + 1}. ${escapeHtml(r.label)}</h2>${prose(r.detail)}<ul class="cells">${b.cols
      .map((c) => {
        const cell = at(r.id, c.id)
        return `<li><span class="chip st-${cell.state}">${GLYPH[cell.state]} ${cell.state}</span> <b>${escapeHtml(c.label)}</b>${cell.note ? ` · ${escapeHtml(cell.note)}` : ''}${cell.hint ? `<div class="hint-line">${escapeHtml(cell.hint)}</div>` : ''}</li>`
      })
      .join('')}</ul>`,
  }))
  const titles = Object.fromEntries(b.cols.map((c) => [c.id, c.label]))
  return { left, sections, titles }
}

export function check(b: MatrixBlock): string[] {
  const errors: string[] = []
  if (!b.rows?.length) errors.push(`matrix ${b.id}: needs at least one row`)
  if (!b.cols?.length) errors.push(`matrix ${b.id}: needs at least one column`)
  const rows = new Set((b.rows ?? []).map((r) => r.id))
  const cols = new Set((b.cols ?? []).map((c) => c.id))
  for (const a of [...(b.rows ?? []), ...(b.cols ?? [])])
    if (!a.label) errors.push(`matrix ${b.id}: axis ${a.id} needs a label`)
  const seen = new Set<string>()
  for (const c of b.cells ?? []) {
    if (!rows.has(c.row)) errors.push(`matrix ${b.id}: cell row "${c.row}" does not exist`)
    if (!cols.has(c.col)) errors.push(`matrix ${b.id}: cell column "${c.col}" does not exist`)
    if (!STATES.includes(c.state))
      errors.push(`matrix ${b.id}: cell ${c.row}×${c.col} state must be valid, warn, error or skip`)
    const k = `${c.row}×${c.col}`
    if (seen.has(k)) errors.push(`matrix ${b.id}: cell ${k} listed twice`)
    seen.add(k)
    if ((c.state === 'warn' || c.state === 'error') && !c.note)
      errors.push(`matrix ${b.id}: cell ${k} is ${c.state}, so say why in note`)
  }
  if (b.default && !STATES.includes(b.default))
    errors.push(`matrix ${b.id}: default must be valid, warn, error or skip`)
  return errors
}

export function nodeIds(b: MatrixBlock): string[] {
  return (b.cols ?? []).map((c) => c.id)
}

const MARK: Record<CellState, string> = { valid: '✓', warn: '⚠', error: '✗', skip: '–' }

export function markdown(b: MatrixBlock): string {
  const cells = cellMap(b)
  const rows = b.rows.map((r) => [
    r.label,
    ...b.cols.map((c) => MARK[cells.get(`${r.id}\u0000${c.id}`)?.state ?? b.default ?? 'skip']),
  ])
  const notes = b.cells
    .filter((c) => c.note || c.hint)
    .map(
      (c) =>
        `- **${b.rows.find((r) => r.id === c.row)?.label ?? c.row} × ${b.cols.find((x) => x.id === c.col)?.label ?? c.col}** ${MARK[c.state]}${c.note ? ` ${c.note}` : ''}${c.hint ? ` _${c.hint}_` : ''}`,
    )
  return parts(
    table(
      [`${b.rowLabel ?? ''} \\ ${b.colLabel ?? ''}`.trim(), ...b.cols.map((c) => c.label)],
      rows,
    ),
    '✓ valid · ⚠ warn · ✗ error · – skip',
    notes.join('\n'),
  )
}
