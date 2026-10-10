/** One path through code as a sequence diagram: participants are the symbols or files the steps run in, messages are the steps in order. The walkthrough carries each step's lines, detail and warnings. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { SeqMessage, SeqParticipant } from '../lib/diagram.ts'
import { diagramBlock, mmId, mmText, sequenceSvg } from '../lib/diagram.ts'
import { fence, indent, items, loc, parts } from '../lib/markdown.ts'
import { tint } from './annotated-text.ts'
import type { CodeFlowBlock, FlowEdge, FlowStep } from './types.ts'

const KINDS = ['call', 'branch', 'loop', 'await', 'return', 'emit', 'error']

/** The participant a step runs in: its symbol, else its source file, else the block. */
function participantOf(s: FlowStep, fallback: string): string {
  const src = Array.isArray(s.source) ? s.source[0] : s.source
  return s.symbol ?? src?.uri.split('/').pop() ?? fallback
}

export function edges(
  step: { next?: FlowEdge[] },
  number: Map<string, number>,
  titles: Map<string, string>,
): string {
  if (!step.next?.length) return ''
  return `<div class="edges">${step.next
    .map(
      (e) =>
        `<a href="#" class="edge" data-select="${escapeHtml(e.to)}">${e.when ? `<span class="when">${escapeHtml(e.when)}</span> ` : ''}→ <span class="badge">${number.get(e.to) ?? '?'}</span> ${escapeHtml(titles.get(e.to) ?? e.to)}</a>`,
    )
    .join('')}</div>`
}

function build(b: CodeFlowBlock): { participants: SeqParticipant[]; messages: SeqMessage[] } {
  const caller = b.entry
    ? { id: '__entry', label: b.entry.length > 28 ? 'caller' : b.entry }
    : { id: '__entry', label: 'caller' }
  const participants: SeqParticipant[] = [caller]
  const seen = new Map<string, string>([[caller.id, caller.id]])
  const pid = (label: string) => {
    if (!seen.has(label)) {
      const id = `p${participants.length}`
      seen.set(label, id)
      participants.push({ id, label })
    }
    return seen.get(label)!
  }
  const number = new Map(b.steps.map((s, i) => [s.id, i + 1]))
  // The participant active at each depth, so a return goes back to whoever called.
  const stack: string[] = [caller.id]
  const messages: SeqMessage[] = b.steps.map((s, i) => {
    const me = pid(participantOf(s, b.title ?? b.id))
    const depth = Math.max(0, s.depth ?? 0)
    stack.length = Math.min(stack.length, depth + 1)
    const from = stack[stack.length - 1] ?? caller.id
    stack[depth + 1] = me
    const kind = (s.kind && KINDS.includes(s.kind) ? s.kind : 'call') as SeqMessage['kind']
    const note = s.next
      ?.map((e) => `${e.when ? e.when + ' → ' : '→ '}${number.get(e.to) ?? '?'}`)
      .join(', ')
    if (kind === 'return')
      return {
        id: s.id,
        n: i + 1,
        from: me,
        to: stack[depth] ?? caller.id,
        label: s.title,
        kind,
        note,
      }
    return { id: s.id, n: i + 1, from, to: me, label: s.title, kind, note }
  })
  return { participants, messages }
}

function mermaid(participants: SeqParticipant[], messages: SeqMessage[]): string {
  const name = new Map(participants.map((p) => [p.id, mmId(p.label)]))
  const lines = [
    'sequenceDiagram',
    ...participants.map((p) => `  participant ${name.get(p.id)} as ${mmText(p.label)}`),
  ]
  for (const m of messages) {
    const a = name.get(m.from)
    const z = name.get(m.to)
    const txt = mmText(`${m.n}. ${m.label}${m.note ? ' (' + m.note + ')' : ''}`)
    if (m.kind === 'branch') lines.push(`  Note over ${z}: alt ${txt}`)
    else if (m.kind === 'return') lines.push(`  ${a}-->>${z}: ${txt}`)
    else if (m.kind === 'emit') lines.push(`  ${a}-)${z}: ${txt}`)
    else if (m.kind === 'error') lines.push(`  ${a}--x${z}: ${txt}`)
    else lines.push(`  ${a}->>${z}: ${txt}`)
  }
  return lines.join('\n')
}

export function render(b: CodeFlowBlock): BlockOut {
  const { participants, messages } = build(b)
  const number = new Map(b.steps.map((s, i) => [s.id, i + 1]))
  const titles = new Map(b.steps.map((s) => [s.id, s.title]))
  const code = (s?: string) =>
    s ? `<pre class="code">${tint(escapeHtml(s), b.language)}</pre>` : ''
  const left = `<div class="flow">${b.entry ? `<div class="trace-input"><span class="eyebrow">Entry</span> ${escapeHtml(b.entry)}</div>` : ''}${diagramBlock(sequenceSvg(participants, messages), mermaid(participants, messages), b.id)}</div>`
  const sections = b.steps.map((s, i) => ({
    id: s.id,
    n: i + 1,
    title: s.title,
    source: s.source,
    html: `<h2>${i + 1}. ${escapeHtml(s.title)}</h2><div class="kicker">${s.kind ? `<span class="chip kind-${s.kind}">${s.kind}</span> ` : ''}${s.symbol ? `<code>${escapeHtml(s.symbol)}</code> · ` : ''}${escapeHtml(s.summary)}</div>${code(s.code)}${prose(s.detail)}${edges(s, number, titles)}${s.warnings?.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('') ?? ''}`,
  }))
  return { left, sections }
}

export function check(b: CodeFlowBlock): string[] {
  const errors: string[] = []
  if ((b.steps?.length ?? 0) < 2) errors.push(`code-flow ${b.id}: needs at least two steps`)
  const ids = new Set((b.steps ?? []).map((s) => s.id))
  for (const s of b.steps ?? []) {
    for (const k of ['title', 'summary'] as const)
      if (!s[k]) errors.push(`code-flow step ${s.id}: ${k} is required`)
    if (s.kind && !KINDS.includes(s.kind))
      errors.push(`code-flow step ${s.id}: kind must be one of ${KINDS.join(', ')}`)
    if (s.depth != null && (!Number.isInteger(s.depth) || s.depth < 0))
      errors.push(`code-flow step ${s.id}: depth must be a whole number`)
    if (s.code && !s.source)
      errors.push(`code-flow step ${s.id}: code without source; say where the lines live`)
    if (!s.symbol && !s.source)
      errors.push(
        `code-flow step ${s.id}: needs a symbol or a source so the diagram knows where it runs`,
      )
    for (const e of s.next ?? [])
      if (!ids.has(e.to)) errors.push(`code-flow step ${s.id}: next "${e.to}" is not a step`)
  }
  return errors
}

/** The flow as a mermaid `sequenceDiagram`. */
export function mermaidSource(b: CodeFlowBlock): string {
  const { participants, messages } = build(b)
  return mermaid(participants, messages)
}

function nextText(
  step: { next?: FlowEdge[] },
  number: Map<string, number>,
  titles: Map<string, string>,
): string {
  return (step.next ?? [])
    .map(
      (e) =>
        `${e.when ? `${e.when} ` : ''}→ ${number.get(e.to) ?? '?'}. ${titles.get(e.to) ?? e.to}`,
    )
    .join('; ')
}

export function markdown(b: CodeFlowBlock): string {
  const number = new Map(b.steps.map((s, i) => [s.id, i + 1]))
  const titles = new Map(b.steps.map((s) => [s.id, s.title]))
  const steps = b.steps.map((s, i) => {
    const head = `${i + 1}. **${s.title}**${s.kind ? ` · ${s.kind}` : ''}${s.symbol ? ` · \`${s.symbol}\`` : ''}${s.source ? ` ${loc(s.source)}` : ''} — ${s.summary}`
    const body = parts(
      fence(s.code, b.language ?? ''),
      s.detail,
      nextText(s, number, titles),
      ...(s.warnings ?? []).map((w) => `⚠ ${w}`),
    )
    return parts(head, body ? indent(body) : '')
  })
  return parts(b.entry ? `Entry: ${b.entry}` : '', fence(mermaidSource(b), 'mermaid'), items(steps))
}
