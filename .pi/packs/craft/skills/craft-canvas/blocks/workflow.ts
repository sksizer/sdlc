/** A process as a flowchart: one node per step (rounded, diamond for a decision, stadium for start and end), edges with their conditions, the lane written in the node. The walkthrough carries each step's summary, duration, artifacts and detail. */
import type { BlockOut, Section } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { FlowEdgeOut, FlowNode } from '../lib/diagram.ts'
import { diagramBlock, flowchartSvg, mmId, mmText } from '../lib/diagram.ts'
import { fence, indent, loc, parts } from '../lib/markdown.ts'
import { edges } from './code-flow.ts'
import type { WorkflowBlock } from './types.ts'

const KINDS = ['start', 'action', 'decision', 'wait', 'handoff', 'end']

function shapeOf(kind?: string): FlowNode['shape'] {
  return kind === 'decision'
    ? 'diamond'
    : kind === 'start' || kind === 'end'
      ? 'stadium'
      : kind === 'wait'
        ? 'wait'
        : 'rect'
}

function graph(b: WorkflowBlock) {
  const laneTitle = new Map(b.lanes.map((l) => [l.id, l.label]))
  const nodes: FlowNode[] = b.steps.map((s, i) => ({
    id: s.id,
    n: i + 1,
    label: s.title,
    sub: laneTitle.get(s.lane) ?? s.lane,
    shape: shapeOf(s.kind),
  }))
  const out: FlowEdgeOut[] = []
  b.steps.forEach((s, i) => {
    const following = b.steps[i + 1]
    if (s.next?.length) for (const e of s.next) out.push({ from: s.id, to: e.to, label: e.when })
    else if (s.kind !== 'end' && following) out.push({ from: s.id, to: following.id })
  })
  return { nodes, edges: out }
}

function mermaid(b: WorkflowBlock, nodes: FlowNode[], out: FlowEdgeOut[]): string {
  const lines = ['flowchart TD']
  for (const n of nodes) {
    const t = mmText(`${n.n}. ${n.label}`)
    const open =
      n.shape === 'diamond'
        ? '{"'
        : n.shape === 'stadium'
          ? '(["'
          : n.shape === 'wait'
            ? '[["'
            : '["'
    const close =
      n.shape === 'diamond'
        ? '"}'
        : n.shape === 'stadium'
          ? '"])'
          : n.shape === 'wait'
            ? '"]]'
            : '"]'
    lines.push(`  ${mmId(n.id)}${open}${t}${close}`)
  }
  for (const e of out)
    lines.push(`  ${mmId(e.from)} ${e.label ? `-- ${mmText(e.label)} ` : ''}--> ${mmId(e.to)}`)
  const byLane = new Map<string, string[]>()
  for (const s of b.steps) byLane.set(s.lane, [...(byLane.get(s.lane) ?? []), mmId(s.id)])
  for (const l of b.lanes)
    if (byLane.get(l.id)?.length)
      lines.push(
        `  subgraph ${mmId(l.id)} [${mmText(l.label)}]`,
        `    ${byLane.get(l.id)!.join(' & ')}`,
        '  end',
      )
  return lines.join('\n')
}

export function render(b: WorkflowBlock): BlockOut {
  const laneIndex = new Map(b.lanes.map((l, i) => [l.id, i % 6]))
  const laneTitle = new Map(b.lanes.map((l) => [l.id, l.label]))
  const number = new Map(b.steps.map((s, i) => [s.id, i + 1]))
  const titles = new Map(b.steps.map((s) => [s.id, s.title]))
  const laneChip = (id: string) =>
    `<span class="chip lane-${laneIndex.get(id) ?? 0}">${escapeHtml(laneTitle.get(id) ?? id)}</span>`
  const legend = `<div class="legend lanes">${b.lanes.map((l) => `<span class="chip lane-${laneIndex.get(l.id)}" data-node="${escapeHtml(l.id)}" title="${escapeHtml(l.detail ?? '')}">${escapeHtml(l.label)}</span>`).join('')}</div>`
  const g = graph(b)
  const left = `<div class="workflow">${b.trigger ? `<div class="trace-input"><span class="eyebrow">Trigger</span> ${escapeHtml(b.trigger)}</div>` : ''}${legend}${diagramBlock(flowchartSvg(g.nodes, g.edges), mermaid(b, g.nodes, g.edges), b.id)}</div>`
  const sections: Section[] = [
    ...b.steps.map((s, i) => ({
      id: s.id,
      n: i + 1,
      title: s.title,
      source: s.source,
      html: `<h2>${i + 1}. ${escapeHtml(s.title)}</h2><div class="kicker">${laneChip(s.lane)} ${s.kind ? `<span class="chip kind-${s.kind}">${s.kind}</span> ` : ''}${s.duration ? `<span class="dur">${escapeHtml(s.duration)}</span> ` : ''}${escapeHtml(s.summary)}</div>${prose(s.detail)}${s.artifacts?.length ? `<section><h4>Produces</h4><p>${s.artifacts.map((a) => `<code>${escapeHtml(a)}</code>`).join(', ')}</p></section>` : ''}${edges(s, number, titles)}${s.warnings?.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('') ?? ''}`,
    })),
    ...b.lanes.map((l) => ({
      id: l.id,
      title: l.label,
      source: l.source,
      html: `<h2>${escapeHtml(l.label)}</h2>${prose(l.detail)}<p class="muted">Steps: ${
        b.steps
          .filter((s) => s.lane === l.id)
          .map(
            (s) =>
              `<a href="#" data-select="${escapeHtml(s.id)}">${number.get(s.id)}. ${escapeHtml(s.title)}</a>`,
          )
          .join(', ') || 'none'
      }</p>`,
    })),
  ]
  return { left, sections }
}

export function check(b: WorkflowBlock): string[] {
  const errors: string[] = []
  if (!b.lanes?.length) errors.push(`workflow ${b.id}: needs at least one lane`)
  if ((b.steps?.length ?? 0) < 2) errors.push(`workflow ${b.id}: needs at least two steps`)
  const lanes = new Set((b.lanes ?? []).map((l) => l.id))
  const ids = new Set((b.steps ?? []).map((s) => s.id))
  for (const l of b.lanes ?? [])
    if (!l.label) errors.push(`workflow ${b.id}: lane ${l.id} needs a label`)
  for (const s of b.steps ?? []) {
    for (const k of ['title', 'summary'] as const)
      if (!s[k]) errors.push(`workflow step ${s.id}: ${k} is required`)
    if (!lanes.has(s.lane)) errors.push(`workflow step ${s.id}: lane "${s.lane}" does not exist`)
    if (s.kind && !KINDS.includes(s.kind))
      errors.push(`workflow step ${s.id}: kind must be one of ${KINDS.join(', ')}`)
    if (s.kind === 'decision' && (s.next?.length ?? 0) < 2)
      errors.push(`workflow step ${s.id}: a decision names at least two next steps`)
    for (const e of s.next ?? [])
      if (!ids.has(e.to)) errors.push(`workflow step ${s.id}: next "${e.to}" is not a step`)
  }
  return errors
}

/** The process as a mermaid `flowchart TD`, lanes as subgraphs. */
export function mermaidSource(b: WorkflowBlock): string {
  const g = graph(b)
  return mermaid(b, g.nodes, g.edges)
}

export function markdown(b: WorkflowBlock): string {
  const laneTitle = new Map(b.lanes.map((l) => [l.id, l.label]))
  const number = new Map(b.steps.map((s, i) => [s.id, i + 1]))
  const titles = new Map(b.steps.map((s) => [s.id, s.title]))
  const lanes = b.lanes.map((l) => `- **${l.label}**${l.detail ? ` — ${l.detail}` : ''}`).join('\n')
  const steps = b.steps.map((s, i) => {
    const head = `${i + 1}. **${s.title}** · ${laneTitle.get(s.lane) ?? s.lane}${s.kind ? ` · ${s.kind}` : ''}${s.duration ? ` · ${s.duration}` : ''}${s.source ? ` ${loc(s.source)}` : ''} — ${s.summary}`
    const next = (s.next ?? [])
      .map(
        (e) =>
          `${e.when ? `${e.when} ` : ''}→ ${number.get(e.to) ?? '?'}. ${titles.get(e.to) ?? e.to}`,
      )
      .join('; ')
    const body = parts(
      s.detail,
      s.artifacts?.length ? `Produces: ${s.artifacts.join(', ')}` : '',
      next,
      ...(s.warnings ?? []).map((w) => `⚠ ${w}`),
    )
    return parts(head, body ? indent(body) : '')
  })
  return parts(
    b.trigger ? `Trigger: ${b.trigger}` : '',
    fence(mermaidSource(b), 'mermaid'),
    lanes,
    steps.join('\n'),
  )
}
