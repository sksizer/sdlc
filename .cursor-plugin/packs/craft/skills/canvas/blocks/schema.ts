/** Tables as cards on the left, grouped by domain; one walkthrough section per table. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { Column, Ref, Relation, SchemaBlock, Table } from './types.ts'

const ref = (r: Ref) => `${r.table}.${r.column}`
const colId = (t: Table, c: Column) => c.id || `${t.id}.${c.name}`

function derivedRelations(b: SchemaBlock): Relation[] {
  if (b.relations) return b.relations
  const rels: Relation[] = []
  for (const t of b.tables) {
    for (const c of t.columns) {
      if (!c.references) continue
      const unique = c.pk || c.flags?.includes('unique')
      rels.push({ id: `rel-${t.name}-${c.name}`, from: { table: t.name, column: c.name }, to: c.references, cardinality: unique ? '1-1' : '1-n' })
    }
  }
  return rels
}

function columnRow(t: Table, c: Column): string {
  const flags = [c.pk ? 'pk' : '', c.nullable === false || c.pk ? 'not null' : 'null', ...(c.flags ?? [])].filter(Boolean)
  return `<tr data-node="${escapeHtml(colId(t, c))}"><td class="mono">${escapeHtml(c.name)}</td><td class="mono">${escapeHtml(c.type)}${c.default != null ? `<br><span class="muted">= ${escapeHtml(c.default)}</span>` : ''}</td><td><span class="chips">${flags.map((f) => `<span class="chip">${escapeHtml(f)}</span>`).join('')}</span></td><td>${c.references ? `<span class="xref" data-select="${escapeHtml(c.references.table)}">${escapeHtml(ref(c.references))}</span>` : ''}${c.purpose ? `<div class="muted">${escapeHtml(c.purpose)}</div>` : ''}</td></tr>`
}

function tableHtml(t: Table, rels: Relation[]): string {
  const out = rels.filter((r) => r.from.table === t.name)
  const inc = rels.filter((r) => r.to.table === t.name)
  const relLine = (r: Relation, other: Ref, mine: Ref) =>
    `<li><code>${escapeHtml(mine.column)}</code> <span class="arrow">${r.cardinality}</span> <span class="xref" data-select="${escapeHtml(other.table)}">${escapeHtml(ref(other))}</span>${r.note ? ` <span class="muted">— ${escapeHtml(r.note)}</span>` : ''}</li>`
  return `<h2 class="mono">${escapeHtml(t.schema ? `${t.schema}.${t.name}` : t.name)}</h2>
<div class="kicker">${t.rows != null ? `~${t.rows.toLocaleString()} rows · ` : ''}${t.columns.length} columns${t.primaryKey ? ` · pk (${escapeHtml(t.primaryKey.join(', '))})` : ''}</div>
${prose(t.purpose)}
<section><h4>Columns</h4><table><thead><tr><th>Name</th><th>Type</th><th>Flags</th><th>References · purpose</th></tr></thead><tbody>${t.columns.map((c) => columnRow(t, c)).join('')}</tbody></table></section>
${t.indexes?.length ? `<section><h4>Indexes</h4><table><thead><tr><th>Name</th><th>Columns</th><th>Purpose</th></tr></thead><tbody>${t.indexes.map((i) => `<tr><td class="mono">${escapeHtml(i.name)}${i.unique ? ' <span class="chip">unique</span>' : ''}</td><td class="mono">(${escapeHtml(i.columns.join(', '))})${i.where ? `<br><span class="muted">where ${escapeHtml(i.where)}</span>` : ''}</td><td>${escapeHtml(i.purpose ?? '')}</td></tr>`).join('')}</tbody></table></section>` : ''}
${out.length || inc.length ? `<section><h4>Relations</h4><ul>${out.map((r) => relLine(r, r.to, r.from)).join('')}${inc.map((r) => relLine(r, r.from, r.to)).join('')}</ul></section>` : ''}
${t.notes?.map((n) => `<div class="warn">${escapeHtml(n)}</div>`).join('') ?? ''}`
}

export function render(b: SchemaBlock): BlockOut {
  const rels = derivedRelations(b)
  const byName = new Map(b.tables.map((t) => [t.name, t]))
  const groups = [...(b.groups ?? [])]
  const grouped = new Set(groups.flatMap((g) => g.tables))
  const rest = b.tables.filter((t) => !grouped.has(t.name)).map((t) => t.name)
  if (rest.length) groups.push({ id: `${b.id}-other`, title: groups.length ? 'Other' : 'Tables', tables: rest })
  const card = (t: Table) =>
    `<div class="card" data-node="${escapeHtml(t.id)}"><div class="name">${escapeHtml(t.name)}</div><div class="purpose">${prose(t.purpose.split(/\n/)[0]).replace(/^<p>|<\/p>$/g, '')}</div><div class="meta">${t.columns.length} cols${t.rows != null ? ` · ~${t.rows.toLocaleString()} rows` : ''}${t.columns.some((c) => c.references) ? ` · ${t.columns.filter((c) => c.references).length} fk` : ''}</div></div>`
  const left = `
${groups.map((g) => `<div class="group"><h2>${escapeHtml(g.title)}</h2><div class="cards">${g.tables.map((n) => byName.get(n)).filter((t): t is Table => !!t).map(card).join('')}</div></div>`).join('')}
${rels.length ? `<div class="group"><h2>Relations</h2><div class="rels">${rels.map((r) => `<div class="rel" data-select="${escapeHtml(r.from.table)}"><span>${escapeHtml(ref(r.from))}</span> <span class="arrow">${r.cardinality === '1-n' ? '»' : r.cardinality === 'n-n' ? '«»' : '='}</span> <span>${escapeHtml(ref(r.to))}</span></div>`).join('')}</div></div>` : ''}`
  const sections = b.tables.map((t) => ({ id: t.id, title: t.name, summary: t.purpose, html: tableHtml(t, rels), source: t.source }))
  const titles = Object.fromEntries(b.tables.flatMap((t) => t.columns.map((c) => [colId(t, c), `${t.name}.${c.name}`])))
  return { left, sections, titles }
}

export function check(b: SchemaBlock): string[] {
  const errors: string[] = []
  if (!b.tables?.length) errors.push(`schema ${b.id}: needs at least one table`)
  const tables = new Map(b.tables?.map((t) => [t.name, t]) ?? [])
  for (const t of b.tables ?? []) {
    if (!t.purpose) errors.push(`table ${t.name}: purpose is required`)
    const cols = new Set(t.columns?.map((c) => c.name))
    for (const c of t.columns ?? []) {
      // A block may hold part of a schema; only a reference into a table it does hold is checked.
      const target = c.references && tables.get(c.references.table)
      if (c.references && target && !target.columns.some((x) => x.name === c.references!.column))
        errors.push(`column ${t.name}.${c.name}: references ${ref(c.references)}, which does not exist`)
    }
    for (const k of t.primaryKey ?? []) if (!cols.has(k)) errors.push(`table ${t.name}: primary key column "${k}" does not exist`)
    for (const i of t.indexes ?? []) for (const k of i.columns) if (!cols.has(k)) errors.push(`index ${i.name}: column "${k}" does not exist`)
  }
  for (const g of b.groups ?? []) for (const n of g.tables) if (!tables.has(n)) errors.push(`group ${g.id}: table "${n}" does not exist`)
  for (const r of b.relations ?? [])
    for (const end of [r.from, r.to])
      if (!tables.get(end.table)?.columns.some((c) => c.name === end.column)) errors.push(`relation ${r.id}: ${ref(end)} does not exist`)
  return errors
}

/** Node ids this block owns beyond its sections: columns and relations. */
export function nodeIds(b: SchemaBlock): string[] {
  return [...b.tables.flatMap((t) => t.columns.map((c) => colId(t, c))), ...(b.relations ?? []).map((r) => r.id), ...(b.groups ?? []).map((g) => g.id)]
}
