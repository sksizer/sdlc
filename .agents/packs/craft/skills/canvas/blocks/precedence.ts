/** An ordered ladder where the first match wins; examples show the rung each one stops at. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { PrecedenceBlock } from './types.ts'

export function render(b: PrecedenceBlock): BlockOut {
  const number = new Map(b.rungs.map((r, i) => [r.id, i + 1]))
  const rungs = b.rungs
    .map(
      (r, i) =>
        `<li class="row" data-node="${escapeHtml(r.id)}"><span class="badge">${i + 1}</span><div><div class="title">${escapeHtml(r.label)}</div>${r.detail ? `<div class="sub">${escapeHtml(r.detail)}</div>` : ''}</div><span class="first">${i === 0 ? 'checked first' : i === b.rungs.length - 1 ? 'last resort' : ''}</span></li>`,
    )
    .join('')
  const examples = b.examples?.length
    ? `<div class="examples"><span class="eyebrow">Examples</span>${b.examples
        .map(
          (e) =>
            `<span class="example" data-node="${escapeHtml(e.id)}" title="${escapeHtml(e.note ?? '')}">${escapeHtml(e.label)} <span class="arrow">→</span> <span class="badge">${number.get(e.matches) ?? '?'}</span></span>`,
        )
        .join('')}</div>`
    : ''
  const left = `<div class="ladder"><ol class="rows">${rungs}</ol>${examples}</div>`
  const byId = new Map(b.rungs.map((r) => [r.id, r]))
  const sections = [
    ...b.rungs.map((r, i) => ({
      id: r.id,
      n: i + 1,
      title: r.label,
      source: r.source,
      html: `<h2>${i + 1}. ${escapeHtml(r.label)}</h2>${prose(r.detail)}`,
    })),
    ...(b.examples ?? []).map((e) => {
      const rung = byId.get(e.matches)
      return {
        id: e.id,
        title: e.label,
        html: `<h2>${escapeHtml(e.label)}</h2><p>Stops at <a href="#" data-select="${escapeHtml(e.matches)}">${number.get(e.matches) ?? '?'}. ${escapeHtml(rung?.label ?? e.matches)}</a>.</p>${prose(e.note)}`,
      }
    }),
  ]
  return { left, sections }
}

export function check(b: PrecedenceBlock): string[] {
  const errors: string[] = []
  if ((b.rungs?.length ?? 0) < 2) errors.push(`precedence ${b.id}: needs at least two rungs`)
  const ids = new Set((b.rungs ?? []).map((r) => r.id))
  for (const r of b.rungs ?? [])
    if (!r.label) errors.push(`precedence ${b.id}: rung ${r.id} needs a label`)
  for (const e of b.examples ?? []) {
    if (!e.label) errors.push(`precedence ${b.id}: example ${e.id} needs a label`)
    if (!ids.has(e.matches))
      errors.push(
        `precedence ${b.id}: example ${e.id} matches rung "${e.matches}", which does not exist`,
      )
  }
  return errors
}
