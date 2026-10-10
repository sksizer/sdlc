/** Ordered operations as rows on the left, grouped by phase; one section per operation. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import { tint } from './annotated-text.ts'
import type { Operation, OperationsBlock } from './types.ts'
import { fence, indent, items, loc, parts } from '../lib/markdown.ts'

function opHtml(op: Operation, n: number, language?: string): string {
  const code = (s: string) => `<pre class="code">${tint(escapeHtml(s), language)}</pre>`
  return `<h2>${n}. ${escapeHtml(op.title)}</h2>
<div class="kicker"><span class="chips"><span class="chip">${escapeHtml(op.kind)}</span><span class="chip ${op.risk}">${op.risk} risk</span><span class="chip">${op.reversible ? 'reversible' : 'not reversible'}</span></span>${op.target ? ` · <code>${escapeHtml(op.target)}</code>` : ''}</div>
${prose(op.detail)}
${op.code ? `<section><h4>Code</h4>${code(op.code)}</section>` : ''}
${op.before || op.after ? `<section><div class="diff"><div><h4>Before</h4>${code(op.before ?? '—')}</div><div><h4>After</h4>${code(op.after ?? '—')}</div></div></section>` : ''}
${op.locks ? `<section><h4>Locks</h4><p>${escapeHtml(op.locks)}</p></section>` : ''}
${op.rollback ? `<section><h4>Rollback</h4>${code(op.rollback)}</section>` : ''}
${op.warnings?.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('') ?? ''}`
}

export function render(b: OperationsBlock): BlockOut {
  const byId = new Map(b.operations.map((op) => [op.id, op]))
  const number = new Map(b.operations.map((op, i) => [op.id, i + 1]))
  const phases = b.phases ?? [
    { id: `${b.id}-all`, title: 'Operations', ops: b.operations.map((o) => o.id) },
  ]
  const row = (op: Operation) =>
    `<li class="row" data-node="${escapeHtml(op.id)}"><span class="badge">${number.get(op.id)}</span><div><div class="title">${escapeHtml(op.title)}</div><div class="sub"><span class="chips"><span class="chip">${escapeHtml(op.kind)}</span><span class="chip ${op.risk}">${op.risk}</span></span>${op.target ? ` <code>${escapeHtml(op.target)}</code>` : ''}</div></div></li>`
  const left = phases
    .map(
      (p) =>
        `<div class="group"><h2>${escapeHtml(p.title)}</h2>${prose(p.detail)}<ol class="rows">${p.ops
          .map((id) => byId.get(id))
          .filter((o): o is Operation => !!o)
          .map(row)
          .join('')}</ol></div>`,
    )
    .join('')
  const sections = b.operations.map((op, i) => ({
    id: op.id,
    n: i + 1,
    title: op.title,
    html: opHtml(op, i + 1, b.language),
    source: op.source,
  }))
  return { left, sections }
}

export function check(b: OperationsBlock): string[] {
  const errors: string[] = []
  if (!b.operations?.length) errors.push(`operations ${b.id}: needs at least one operation`)
  const ops = new Set<string>()
  for (const op of b.operations ?? []) {
    ops.add(op.id)
    for (const k of ['kind', 'title', 'detail', 'risk'] as const)
      if (!op[k]) errors.push(`operation ${op.id}: ${k} is required`)
    if (!['low', 'medium', 'high'].includes(op.risk))
      errors.push(`operation ${op.id}: risk must be low, medium or high`)
    if (typeof op.reversible !== 'boolean')
      errors.push(`operation ${op.id}: reversible must be true or false`)
    if (op.reversible === false && !op.rollback)
      errors.push(`operation ${op.id}: not reversible, so say what the rollback would take`)
  }
  const placed = new Set<string>()
  for (const ph of b.phases ?? []) {
    for (const id of ph.ops) {
      if (!ops.has(id)) errors.push(`phase ${ph.id}: operation "${id}" does not exist`)
      placed.add(id)
    }
  }
  if (b.phases)
    for (const id of ops) if (!placed.has(id)) errors.push(`operation ${id} is in no phase`)
  return errors
}

export function nodeIds(b: OperationsBlock): string[] {
  return (b.phases ?? []).map((p) => p.id)
}

function opMarkdown(op: Operation, n: number, language?: string): string {
  const head = `${n}. **${op.title}** · ${op.kind}${op.target ? ` ${op.target}` : ''} · risk ${op.risk}${op.reversible ? '' : ' · irreversible'}${op.source ? ` ${loc(op.source)}` : ''}`
  const body = parts(
    fence(op.code, language ?? ''),
    op.detail,
    op.locks ? `Locks: ${op.locks}` : '',
    op.rollback ? `Rollback: ${op.rollback}` : '',
    op.before || op.after ? `Before: \`${op.before ?? '—'}\` · After: \`${op.after ?? '—'}\`` : '',
    ...(op.warnings ?? []).map((w) => `⚠ ${w}`),
  )
  return parts(head, body ? indent(body) : '')
}

export function markdown(b: OperationsBlock): string {
  const byId = new Map(b.operations.map((o, i) => [o.id, { o, n: i + 1 }]))
  if (!b.phases?.length) return items(b.operations.map((o, i) => opMarkdown(o, i + 1, b.language)))
  return b.phases
    .map((p) =>
      parts(
        `### ${p.title}`,
        p.detail,
        items(
          p.ops
            .map((id) => byId.get(id))
            .filter((x): x is { o: Operation; n: number } => !!x)
            .map(({ o, n }) => opMarkdown(o, n, b.language)),
        ),
      ),
    )
    .join('\n\n')
}
