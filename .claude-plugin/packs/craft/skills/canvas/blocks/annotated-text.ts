/**
 * Text with numbered steps anchored into it. The text is split at every
 * step boundary; each segment lists the steps covering it, innermost last, so
 * nested steps highlight correctly. A numbered badge opens each step.
 */
import type { BlockOut, Section } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { Anchor, AnnotatedTextBlock, Ref, Step } from './types.ts'
import { fence, indent, items, loc, parts } from '../lib/markdown.ts'

const SQL_KEYWORDS =
  /\b(WITH|RECURSIVE|SELECT|DISTINCT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AS|AND|OR|NOT|IN|IS|NULL|CASE|WHEN|THEN|ELSE|END|OVER|PARTITION BY|ROWS|BETWEEN|UNBOUNDED|PRECEDING|CURRENT ROW|UNION|ALL|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|TYPE|ENUM|INDEX|COLUMN|ADD|CONSTRAINT|REFERENCES|PRIMARY KEY|FOREIGN KEY|DEFAULT|CONCURRENTLY|CHECK|VALIDATE|RETURNING|ASC|DESC|NULLS|FIRST|LAST|COALESCE|COUNT|SUM|AVG|MIN|MAX|ROW_NUMBER|RANK|LAG|LEAD|DATE_TRUNC|INTERVAL|TRUE|FALSE)\b/g

const CODE_KEYWORDS =
  /\b(import|export|from|const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|interface|type|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|default|def|elif|lambda|with|as|pass|yield|raise|except|not|and|or|is|None|True|False|fn|pub|struct|enum|impl|match|mut|use|mod)\b/g

export function tint(escaped: string, language?: string): string {
  if (language === 'sql') return escaped.replace(SQL_KEYWORDS, '<span class="kw">$1</span>')
  if (language && /^(ts|js|typescript|javascript|py|python|rust|go)$/.test(language))
    return escaped.replace(CODE_KEYWORDS, '<span class="kw">$1</span>')
  return escaped
}

const ref = (r: Ref | string) => (typeof r === 'string' ? r : `${r.table}.${r.column}`)

interface Range {
  id: string
  n: number
  start: number
  end: number
}

/** Every start offset of `needle` in `text`. */
function occurrences(text: string, needle: string): number[] {
  const out: number[] = []
  let from = 0
  for (;;) {
    const i = text.indexOf(needle, from)
    if (i < 0) return out
    out.push(i)
    from = i + 1
  }
}

/** Resolve one selector to a character range; throw with the reason so the agent can fix it. */
export function resolveSelector(
  text: string,
  sel: Anchor,
  who: string,
): { start: number; end: number } {
  if (sel.type === 'TextPositionSelector') {
    if (!(sel.start >= 0 && sel.end > sel.start && sel.end <= text.length)) {
      throw new Error(
        `${who}: TextPositionSelector ${sel.start}-${sel.end} is outside the text (length ${text.length})`,
      )
    }
    return { start: sel.start, end: sel.end }
  }
  if (sel.type !== 'TextQuoteSelector')
    throw new Error(`${who}: anchor.type must be TextQuoteSelector or TextPositionSelector`)
  if (!sel.exact) throw new Error(`${who}: TextQuoteSelector needs exact`)
  let hits = occurrences(text, sel.exact)
  if (!hits.length) throw new Error(`${who}: exact text not found: ${JSON.stringify(sel.exact)}`)
  if (sel.prefix) hits = hits.filter((i) => text.slice(0, i).endsWith(sel.prefix!))
  if (sel.suffix)
    hits = hits.filter((i) => text.slice(i + sel.exact.length).startsWith(sel.suffix!))
  if (!hits.length) throw new Error(`${who}: exact text found, but not with that prefix/suffix`)
  if (hits.length > 1)
    throw new Error(
      `${who}: exact text appears ${hits.length} times; add a prefix or suffix to pick one`,
    )
  // hits is non-empty here: the empty case threw above.
  const start = hits[0]!
  return { start, end: start + sel.exact.length }
}

/** Resolve every step's anchor to a character range. */
export function resolveAnchors(text: string, steps: Step[]): Range[] {
  return steps.map((step, i) => ({
    id: step.id,
    n: i + 1,
    ...resolveSelector(text, step.anchor, `step ${step.id}`),
  }))
}

export function anchoredText(text: string, ranges: Range[], language?: string): string {
  const cuts = new Set<number>([0, text.length])
  for (const r of ranges) {
    cuts.add(r.start)
    cuts.add(r.end)
  }
  const points = [...cuts].sort((a, b) => a - b)
  let out = ''
  for (let i = 0; i < points.length - 1; i++) {
    // i + 1 < points.length by the loop bound.
    const a = points[i]!
    const b = points[i + 1]!
    const starting = ranges
      .filter((r) => r.start === a)
      .sort((x, y) => y.end - y.start - (x.end - x.start))
    for (const r of starting) {
      out += `<button class="badge" type="button" data-node="${escapeHtml(r.id)}" title="Step ${r.n}">${r.n}</button>`
    }
    const covering = ranges
      .filter((r) => r.start <= a && r.end >= b)
      .sort((x, y) => y.end - y.start - (x.end - x.start))
      .map((r) => r.id)
    const segment = tint(escapeHtml(text.slice(a, b)), language)
    out += covering.length
      ? `<span class="seg" data-steps="${escapeHtml(covering.join(' '))}">${segment}</span>`
      : segment
  }
  return out
}

function stepHtml(step: Step, n: number): string {
  const touches = step.touches?.map((t) => `<code>${escapeHtml(ref(t))}</code>`).join(' ')
  const quoted =
    step.anchor.type === 'TextQuoteSelector'
      ? step.anchor.exact
      : `${step.anchor.start}-${step.anchor.end}`
  const anchor = quoted.length > 60 ? quoted.slice(0, 57) + '…' : quoted
  return `<h2>${n}. ${escapeHtml(step.title)}</h2>
<div class="kicker">anchored to <code>${escapeHtml(anchor)}</code></div>
${prose(step.detail)}
${touches ? `<section><h4>Touches</h4><p>${touches}</p></section>` : ''}
${step.cost ? `<section><h4>Cost</h4><dl class="dl">${step.cost.rows != null ? `<dt>Rows</dt><dd>${step.cost.rows.toLocaleString()}</dd>` : ''}${step.cost.note ? `<dt>Note</dt><dd>${escapeHtml(step.cost.note)}</dd>` : ''}</dl></section>` : ''}
${step.warnings?.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('') ?? ''}`
}

export function render(b: AnnotatedTextBlock): BlockOut {
  const ranges = resolveAnchors(b.text, b.steps)
  const sections: Section[] = b.steps.map((s, i) => ({
    id: s.id,
    n: i + 1,
    title: s.title,
    summary: s.summary,
    html: stepHtml(s, i + 1),
    source: s.source,
  }))
  const left = `<pre class="sql">${anchoredText(b.text, ranges, b.language)}</pre>`
  return { left, sections }
}

export function check(b: AnnotatedTextBlock): string[] {
  const errors: string[] = []
  if (!b.text?.trim()) errors.push(`annotated-text ${b.id}: text is required`)
  if (!b.steps?.length) errors.push(`annotated-text ${b.id}: needs at least one step`)
  for (const s of b.steps ?? []) {
    for (const k of ['title', 'summary', 'detail'] as const)
      if (!s[k]) errors.push(`step ${s.id}: ${k} is required`)
    if (!s.anchor?.type)
      errors.push(`step ${s.id}: anchor must be a TextQuoteSelector or TextPositionSelector`)
  }
  // One try per step, so every broken anchor is reported in one run.
  for (const s of b.steps ?? []) {
    if (!b.text || !s.anchor?.type) continue
    try {
      resolveSelector(b.text, s.anchor, `step ${s.id}`)
    } catch (e) {
      errors.push(String(e instanceof Error ? e.message : e))
    }
  }
  return errors
}

export function markdown(b: AnnotatedTextBlock): string {
  const steps = b.steps.map((s, i) => {
    const quote =
      s.anchor.type === 'TextQuoteSelector' ? ` — \`${s.anchor.exact.replace(/\s+/g, ' ')}\`` : ''
    const extra = [
      s.touches?.length
        ? `touches ${s.touches.map((t) => (typeof t === 'string' ? t : `${t.table}.${t.column}`)).join(', ')}`
        : '',
      s.cost?.rows != null ? `~${s.cost.rows} rows` : '',
      s.cost?.note ?? '',
    ]
      .filter(Boolean)
      .join(' · ')
    return parts(
      `${i + 1}. **${s.title}**${quote}: ${s.summary}${extra ? ` _(${extra})_` : ''}${s.source ? ` ${loc(s.source)}` : ''}`,
      s.detail ? indent(s.detail) : '',
      ...(s.warnings ?? []).map((w) => `   - ⚠ ${w}`),
    )
  })
  return parts(fence(b.text, b.language ?? ''), items(steps))
}
