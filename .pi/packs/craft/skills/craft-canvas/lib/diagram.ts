/**
 * Two diagram renderers with no dependencies, in the two shapes people already
 * read: a sequence diagram (participants, lifelines, messages in order) and a
 * flowchart laid out top to bottom (one column, forward skips routed on the
 * right, loops on the left). Each also emits its mermaid source, so a document
 * can be pasted into any mermaid renderer.
 */
import { escapeHtml } from './doc.ts'

export interface SeqParticipant {
  id: string
  label: string
}
export interface SeqMessage {
  id: string
  n: number
  from: string
  to: string
  label: string
  kind: 'call' | 'await' | 'return' | 'emit' | 'error' | 'branch' | 'loop'
  /** For a branch: the condition and where it goes. */
  note?: string | undefined
}

const ell = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

function svgText(
  x: number,
  y: number,
  text: string,
  cls: string,
  anchor = 'middle',
  title?: string,
): string {
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${title ? `<title>${escapeHtml(title)}</title>` : ''}${escapeHtml(text)}</text>`
}

/** A sequence diagram. Participants are columns; messages are rows in order. */
export function sequenceSvg(participants: SeqParticipant[], messages: SeqMessage[]): string {
  const colW = Math.max(170, ...participants.map((p) => p.label.length * 7 + 40))
  const left = 30
  const headH = 30
  const rowH = 46
  const x = new Map(participants.map((p, i) => [p.id, left + colW / 2 + i * colW]))
  const width = left * 2 + participants.length * colW
  const top = 10
  const bodyTop = top + headH + 16
  const height = bodyTop + messages.length * rowH + 24
  const parts = participants
    .map((p) => {
      const cx = x.get(p.id)!
      return `<g class="seq-part"><line x1="${cx}" y1="${top + headH}" x2="${cx}" y2="${height - 10}" class="lifeline"/><rect x="${cx - colW / 2 + 12}" y="${top}" width="${colW - 24}" height="${headH}" rx="6" class="part"/>${svgText(cx, top + headH / 2 + 4, ell(p.label, Math.floor((colW - 30) / 7)), 'part-label', 'middle', p.label)}</g>`
    })
    .join('')
  const msgs = messages
    .map((m, i) => {
      const y = bodyTop + i * rowH + rowH / 2
      const x1 = x.get(m.from) ?? left
      const x2 = x.get(m.to) ?? left
      const band = `<rect x="${left - 10}" y="${y - rowH / 2 + 2}" width="${width - left * 2 + 20}" height="${rowH - 4}" rx="6" class="band"/>`
      const label = `${m.n}. ${m.label}`
      if (m.kind === 'branch') {
        const bx = Math.min(x1, x2) - 60
        return `<g class="seq-msg ${m.kind}" data-node="${escapeHtml(m.id)}">${band}<rect x="${bx}" y="${y - 15}" width="${Math.abs(x2 - x1) + 120}" height="30" rx="4" class="alt"/>${svgText(bx + 8, y - 2, 'alt', 'alt-tag', 'start')}${svgText(bx + 8, y + 11, ell(`${label}${m.note ? ' · ' + m.note : ''}`, Math.floor((Math.abs(x2 - x1) + 100) / 6.4)), 'alt-text', 'start', `${label}${m.note ? ' · ' + m.note : ''}`)}</g>`
      }
      if (x1 === x2) {
        // self message: a small loop to the right
        const d = `M ${x1} ${y - 10} h 28 v 20 h -28`
        return `<g class="seq-msg ${m.kind}" data-node="${escapeHtml(m.id)}">${band}<path d="${d}" class="arrow ${m.kind}" marker-end="url(#${m.kind === 'return' ? 'open' : m.kind === 'emit' ? 'open' : 'head'})"/>${svgText(x1 + 34, y + 4, ell(label, 44), 'msg', 'start', label)}</g>`
      }
      const dir = x2 > x1 ? 1 : -1
      const mid = (x1 + x2) / 2
      const marker =
        m.kind === 'return' || m.kind === 'emit' ? 'open' : m.kind === 'error' ? 'cross' : 'head'
      return `<g class="seq-msg ${m.kind}" data-node="${escapeHtml(m.id)}">${band}<line x1="${x1}" y1="${y}" x2="${x2 - dir * 6}" y2="${y}" class="arrow ${m.kind}" marker-end="url(#${marker})"/>${svgText(mid, y - 6, ell(label, Math.floor(Math.abs(x2 - x1) / 6.4)), 'msg', 'middle', label)}</g>`
    })
    .join('')
  return `<svg class="diagram seq" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${DEFS}${parts}${msgs}</svg>`
}

export interface FlowNode {
  id: string
  n: number
  label: string
  sub?: string
  shape: 'rect' | 'diamond' | 'stadium' | 'wait'
}
export interface FlowEdgeOut {
  from: string
  to: string
  label?: string | undefined
}

/** A top-down flowchart: one column of nodes, skips routed on the right, loops on the left. */
export function flowchartSvg(nodes: FlowNode[], edges: FlowEdgeOut[]): string {
  const w = 260
  const h = 46
  const rowH = 78
  const cx = 230
  const width = 460
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const yOf = (i: number) => 24 + i * rowH + h / 2
  const height = 24 + nodes.length * rowH
  const shapes = nodes
    .map((n, i) => {
      const y = yOf(i)
      let shape = ''
      if (n.shape === 'diamond')
        shape = `<path d="M ${cx} ${y - h / 2 - 6} L ${cx + w / 2 - 20} ${y} L ${cx} ${y + h / 2 + 6} L ${cx - w / 2 + 20} ${y} Z" class="shape"/>`
      else if (n.shape === 'stadium')
        shape = `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" class="shape"/>`
      else if (n.shape === 'wait')
        shape = `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" class="shape"/><line x1="${cx - w / 2 + 6}" y1="${y - h / 2}" x2="${cx - w / 2 + 6}" y2="${y + h / 2}" class="shape-line"/><line x1="${cx + w / 2 - 6}" y1="${y - h / 2}" x2="${cx + w / 2 - 6}" y2="${y + h / 2}" class="shape-line"/>`
      else
        shape = `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" class="shape"/>`
      const label = `${n.n}. ${n.label}`
      const maxChars = n.shape === 'diamond' ? 26 : 34
      return `<g class="fc-node ${n.shape}" data-node="${escapeHtml(n.id)}">${shape}${svgText(cx, y + (n.sub ? 0 : 4), ell(label, maxChars), 'node-label', 'middle', label)}${n.sub ? svgText(cx, y + 14, ell(n.sub, 40), 'node-sub', 'middle', n.sub) : ''}</g>`
    })
    .join('')
  let rightLanes = 0
  let leftLanes = 0
  const labels: string[] = []
  const lines = edges
    .map((e) => {
      const a = idx.get(e.from)
      const b = idx.get(e.to)
      if (a == null || b == null) return ''
      const ya = yOf(a)
      const yb = yOf(b)
      if (b === a + 1) {
        const y1 = ya + h / 2 + (nodes[a]?.shape === 'diamond' ? 6 : 0)
        const y2 = yb - h / 2 - (nodes[b]?.shape === 'diamond' ? 6 : 0) - 6
        if (e.label) labels.push(labelAt(e.label, cx + 10, (y1 + y2) / 2, 'start'))
        return `<g class="fc-edge"><line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" class="edge" marker-end="url(#fhead)"/></g>`
      }
      const forward = b > a
      const lane = forward ? rightLanes++ : leftLanes++
      const xs = forward ? cx + w / 2 : cx - w / 2
      const xr = forward ? cx + w / 2 + 26 + lane * 16 : cx - w / 2 - 26 - lane * 16
      const yEnd = yb - h / 2 - 6
      const d = `M ${xs} ${ya} H ${xr} V ${yb - h / 2 - 14} H ${cx + (forward ? 20 : -20)} V ${yEnd}`
      if (e.label) labels.push(labelAt(e.label, xr, (ya + yb) / 2, 'middle'))
      return `<g class="fc-edge ${forward ? 'skip' : 'loop'}"><path d="${d}" class="edge" marker-end="url(#fhead)"/></g>`
    })
    .join('')
  return `<svg class="diagram fc" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${DEFS}${lines}${labels.join('')}${shapes}</svg>`
}

function labelAt(text: string, x: number, y: number, anchor: string): string {
  const tw = text.length * 6.2 + 10
  const lx = anchor === 'start' ? x + tw / 2 : x
  return `<g class="edge-label"><rect x="${lx - tw / 2}" y="${y - 9}" width="${tw}" height="16" rx="4" class="label-bg"/>${svgText(lx, y + 3, text, 'edge-text')}</g>`
}

const DEFS = `<defs>
<marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="mk"/></marker>
<marker id="open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" class="mk-open"/></marker>
<marker id="cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 1 1 L 9 9 M 9 1 L 1 9" class="mk-cross"/></marker>
<marker id="fhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="mk"/></marker>
</defs>`

/** The diagram plus its mermaid source behind a disclosure, with a copy button. */
export function diagramBlock(svg: string, mermaid: string, id: string): string {
  return `<div class="diagram-wrap">${svg}</div><details class="mermaid-src"><summary>Mermaid source <button type="button" class="quiet copy" data-copy="mm-${escapeHtml(id)}">Copy</button></summary><pre id="mm-${escapeHtml(id)}">${escapeHtml(mermaid)}</pre></details>`
}

export const mmId = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_')
export const mmText = (s: string) => s.replace(/"/g, '#quot;')
