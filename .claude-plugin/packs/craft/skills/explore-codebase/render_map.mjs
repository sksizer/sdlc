/**
 * render_map.mjs — turn a MapPage payload into one self-contained HTML page.
 *
 *   node render_map.mjs <payload.json> <out.html>
 *
 * The contract is `map-page.schema.json` beside this file. The payload carries
 * content and diagram DATA; every pixel decision lives here, so improving a
 * layout improves every page ever rendered and no caller can emit an SVG that
 * overflows, overlaps, or disappears in dark mode.
 *
 * No dependencies. Typed with JSDoc so `tsc --checkJs --noEmit` covers it
 * without a build step standing between the source and what ships.
 *
 * @typedef {{ title: string, lines?: string[], accent?: Accent }} Box
 * @typedef {'none'|'good'|'warn'|'bad'} Accent
 * @typedef {{ label?: string, boxes: Box[] }} Layer
 * @typedef {{ kind:'layers', layers: Layer[], boundary?: {after:number,label:string}, arrows?: 'none'|'down' }} Layers
 * @typedef {{ kind:'pipeline', stages: Box[], outputs?: {label:string,boxes:Box[]} }} Pipeline
 * @typedef {{ kind:'inventory', label:string, sublabel?:string, columns?:number,
 *             items:{name:string,note?:string,accent?:Accent}[] }} Inventory
 * @typedef {{ kind:'raw', svg:string, viewBox:string }} Raw
 * @typedef {{ title:string, sublabel?:string, accent?:Accent, columns?:number,
 *             items?:{name:string,note?:string,accent?:Accent}[], groups?:Group[] }} Group
 * @typedef {{ kind:'containment', columns?:number, groups: Group[] }} Containment
 * @typedef {Layers|Pipeline|Inventory|Containment|Raw} Diagram
 * @typedef {{type:'p',text:string}
 *          |{type:'ul',items:string[]}
 *          |{type:'table',head:string[],rows:string[][]}
 *          |{type:'panel',heading:string,blocks:Block[]}
 *          |{type:'figure',caption:string,cite?:string,diagram:Diagram}} Block
 * @typedef {{ heading:string, blocks: Block[] }} Section
 * @typedef {{ title:string, lede:string, meta?:string, sections:Section[] }} MapPage
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const esc = (/** @type {string} */ s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Escape first, then re-introduce the two marks the payload may use. */
const inline = (/** @type {string} */ s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

/** A stable anchor for a heading, deduped against those already used. */
function slug(/** @type {string} */ s, /** @type {Set<string>} */ used) {
  const base =
    s
      .toLowerCase()
      .replace(/[`*]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  let out = base
  for (let n = 2; used.has(out); n++) out = `${base}-${n}`
  used.add(out)
  return out
}

const ACCENT = {
  none: 'var(--r-border)',
  good: 'var(--r-success)',
  warn: 'var(--r-warning)',
  bad: 'var(--r-error)',
}
const stroke = (/** @type {Accent=} */ a) => ACCENT[a ?? 'none'] ?? ACCENT.none

/**
 * Character-width estimate at a given font size, for monospace-ish SVG labels.
 * Deliberately generous: a box that is too wide reads fine, one that is too
 * narrow clips its own text.
 */
const textWidth = (/** @type {string} */ s, /** @type {number} */ size) => s.length * size * 0.58

// ---------------------------------------------------------------------------
// SVG primitives — every colour is a token so both themes work
// ---------------------------------------------------------------------------

const ARROW_DEFS = `<defs>
<marker id="mp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="var(--r-muted)"/></marker></defs>`

/** @returns {string} */
function boxSvg(
  /** @type {Box} */ box,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ w,
  /** @type {number} */ h,
) {
  const lines = box.lines ?? []
  const titleY = lines.length ? y + 24 : y + h / 2 + 5
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="var(--r-card)" stroke="${stroke(box.accent)}" stroke-width="${box.accent && box.accent !== 'none' ? 1.5 : 1}"/>`,
    `<text x="${x + 14}" y="${titleY}" fill="var(--r-heading)" font-size="13">${esc(box.title)}</text>`,
  ]
  lines.forEach((l, i) => {
    parts.push(
      `<text x="${x + 14}" y="${titleY + 19 + i * 16}" fill="var(--r-muted)" font-size="11">${esc(l)}</text>`,
    )
  })
  return parts.join('')
}

const boxHeight = (/** @type {Box} */ b) => (b.lines?.length ? 34 + b.lines.length * 16 : 44)

/** Width a box needs before its own text would clip. */
const boxWidth = (/** @type {Box} */ b) =>
  Math.max(textWidth(b.title, 13), ...(b.lines ?? []).map((l) => textWidth(l, 11))) + 28

/**
 * Lays boxes evenly across a row at least `min` wide. Where the content does
 * not fit, the row grows past `min` instead of clipping: the caller widens the
 * viewBox and the whole diagram scales down together, which keeps the promise
 * that a payload cannot produce an SVG that overflows its box.
 */
function rowLayout(
  /** @type {Box[]} */ boxes,
  /** @type {number} */ min,
  /** @type {number} */ gap,
) {
  const even = (min - gap * (boxes.length - 1)) / boxes.length
  const w = Math.max(even, ...boxes.map(boxWidth))
  return {
    cells: boxes.map((b, i) => ({ box: b, x: i * (w + gap), w })),
    width: boxes.length * w + gap * (boxes.length - 1),
  }
}

// ---------------------------------------------------------------------------
// Diagram kinds
// ---------------------------------------------------------------------------

const W = 880 // viewBox width every diagram is laid out against
const PAD = 16

/** @returns {string} */
function renderLayers(/** @type {Layers} */ d) {
  const gap = 20
  const arrows = (d.arrows ?? 'down') === 'down'
  // Widest row sets the diagram; every other row is then laid out to match it.
  const inner = Math.max(...d.layers.map((l) => rowLayout(l.boxes, W - PAD * 2, gap).width))
  const width = inner + PAD * 2
  const rows = d.layers.map((l) => rowLayout(l.boxes, inner, gap))
  let y = PAD
  const parts = [ARROW_DEFS]

  d.layers.forEach((layer, li) => {
    if (layer.label) {
      parts.push(
        `<text x="${PAD}" y="${y + 12}" fill="var(--r-muted)" font-size="11.5" font-family="var(--r-font)">${esc(layer.label)}</text>`,
      )
      y += 22
    }
    const h = Math.max(...layer.boxes.map(boxHeight))
    for (const { box, x, w } of rows[li].cells) {
      parts.push(boxSvg(box, PAD + x, y, w, h))
    }
    y += h

    const last = li === d.layers.length - 1
    if (!last) {
      const isBoundary = d.boundary && d.boundary.after === li
      if (isBoundary) {
        y += 18
        parts.push(
          `<line x1="${PAD}" y1="${y}" x2="${width - PAD}" y2="${y}" stroke="var(--r-error)" stroke-width="1.5" stroke-dasharray="6 4"/>`,
        )
        const label = /** @type {{after:number,label:string}} */ (d.boundary).label
        const lw = textWidth(label, 11.5) + 24
        parts.push(
          `<rect x="${(width - lw) / 2}" y="${y - 12}" width="${lw}" height="24" rx="4" fill="var(--r-bg)"/>`,
        )
        parts.push(
          `<text x="${width / 2}" y="${y + 4}" text-anchor="middle" fill="var(--r-error)" font-size="11.5" font-family="var(--r-font)">${esc(label)}</text>`,
        )
        y += 22
      } else if (arrows) {
        parts.push(
          `<line x1="${width / 2}" y1="${y + 6}" x2="${width / 2}" y2="${y + 28}" stroke="var(--r-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>`,
        )
        y += 34
      } else {
        y += 20
      }
    }
  })
  return svgWrap(parts.join(''), y + PAD, width)
}

/** @returns {string} */
function renderPipeline(/** @type {Pipeline} */ d) {
  const gap = 34
  const outGap = 18
  // Stages and outputs share one width, whichever of the two rows needs more.
  const inner = Math.max(
    rowLayout(d.stages, W - PAD * 2, gap).width,
    d.outputs ? rowLayout(d.outputs.boxes, W - PAD * 2, outGap).width : 0,
  )
  const width = inner + PAD * 2
  const h = Math.max(...d.stages.map(boxHeight))
  const parts = [ARROW_DEFS]
  const laid = rowLayout(d.stages, inner, gap).cells
  for (const { box, x, w } of laid) {
    parts.push(boxSvg(box, PAD + x, PAD, w, h))
  }
  // one arrow in each gap
  for (let i = 0; i < laid.length - 1; i++) {
    const from = PAD + laid[i].x + laid[i].w
    parts.push(
      `<line x1="${from + 6}" y1="${PAD + h / 2}" x2="${from + gap - 6}" y2="${PAD + h / 2}" stroke="var(--r-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>`,
    )
  }
  let y = PAD + h

  if (d.outputs) {
    y += 34
    parts.push(
      `<text x="${PAD}" y="${y}" fill="var(--r-muted)" font-size="11.5" font-family="var(--r-font)">${esc(d.outputs.label)}</text>`,
    )
    y += 14
    const oh = Math.max(...d.outputs.boxes.map(boxHeight))
    for (const { box, x, w } of rowLayout(d.outputs.boxes, inner, outGap).cells) {
      parts.push(boxSvg(box, PAD + x, y, w, oh))
    }
    y += oh
  }
  return svgWrap(parts.join(''), y + PAD, width)
}

/** @returns {string} */
function renderInventory(/** @type {Inventory} */ d) {
  const cols = d.columns ?? 5
  // A column is as wide as the widest name (plus its note) needs, never less
  // than an even share; the container grows to suit.
  const cellW = (/** @type {{name:string,note?:string}} */ it) =>
    textWidth(it.name, 11.5) + (it.note ? 8 + textWidth(it.note, 10) : 0) + 16
  const colW = Math.max((W - PAD * 2 - 36) / cols, ...d.items.map(cellW))
  const inner = 36 + colW * cols
  const rows = Math.ceil(d.items.length / cols)
  let top = PAD
  const parts = []

  const headH = d.sublabel ? 46 : 28
  const bodyH = headH + rows * 22 + 16
  parts.push(
    `<rect x="${PAD}" y="${top}" width="${inner}" height="${bodyH}" rx="6" fill="var(--r-accent-wash)" stroke="var(--r-accent-line)" stroke-width="1.5"/>`,
  )
  parts.push(
    `<text x="${PAD + 18}" y="${top + 24}" fill="var(--r-heading)" font-size="14">${esc(d.label)}</text>`,
  )
  if (d.sublabel) {
    parts.push(
      `<text x="${PAD + 18}" y="${top + 42}" fill="var(--r-muted)" font-size="11" font-family="var(--r-font)">${esc(d.sublabel)}</text>`,
    )
  }
  d.items.forEach((item, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = PAD + 18 + c * colW
    const y = top + headH + 20 + r * 22
    const fill = item.accent && item.accent !== 'none' ? stroke(item.accent) : 'var(--r-heading)'
    parts.push(`<text x="${x}" y="${y}" fill="${fill}" font-size="11.5">${esc(item.name)}</text>`)
    if (item.note) {
      parts.push(
        `<text x="${x + textWidth(item.name, 11.5) + 8}" y="${y}" fill="var(--r-muted)" font-size="10" font-family="var(--r-font)">${esc(item.note)}</text>`,
      )
    }
  })
  return svgWrap(parts.join(''), top + bodyH + PAD, inner + PAD * 2)
}

// --- containment: boxes inside boxes ---------------------------------------

const G_PAD = 14 // inner padding on every group box
const G_GAP = 12 // between sibling groups
const ITEM_H = 22
/** Fill per nesting depth, so a child reads as sitting inside its parent. */
const NEST_FILL = ['var(--r-surface)', 'var(--r-card)', 'var(--r-chip)']

const headHeight = (/** @type {Group} */ g) => (g.sublabel ? 44 : 26)

const itemWidth = (/** @type {{name:string,note?:string}} */ it) =>
  textWidth(it.name, 11.5) + (it.note ? 8 + textWidth(it.note, 10) : 0) + 16

/**
 * Narrowest this group can be drawn without clipping anything inside it. Every
 * caller keeps a group at or above this width, which is what makes the grid
 * arithmetic below safe at any depth.
 */
function groupMinWidth(/** @type {Group} */ g) {
  const head = Math.max(textWidth(g.title, 13.5), g.sublabel ? textWidth(g.sublabel, 11) : 0)
  let body
  if (g.items) {
    body = Math.max(...g.items.map(itemWidth))
  } else {
    const kids = /** @type {Group[]} */ (g.groups)
    const c = Math.min(g.columns ?? 2, kids.length)
    body = Math.max(...kids.map(groupMinWidth)) * c + G_GAP * (c - 1)
  }
  return Math.max(head, body) + G_PAD * 2
}

/** How a group's contents divide up at width `w`. */
function groupGrid(/** @type {Group} */ g, /** @type {number} */ w) {
  const inner = w - G_PAD * 2
  if (g.items) {
    const cols = Math.max(1, Math.floor(inner / Math.max(...g.items.map(itemWidth))))
    return { cols, cellW: inner / cols }
  }
  const kids = /** @type {Group[]} */ (g.groups)
  const cols = Math.min(g.columns ?? 2, kids.length)
  return { cols, cellW: (inner - G_GAP * (cols - 1)) / cols }
}

/** @returns {number} */
function groupHeight(/** @type {Group} */ g, /** @type {number} */ w) {
  const { cols, cellW } = groupGrid(g, w)
  if (g.items) return headHeight(g) + Math.ceil(g.items.length / cols) * ITEM_H + G_PAD
  const kids = /** @type {Group[]} */ (g.groups)
  let h = headHeight(g)
  for (let i = 0; i < kids.length; i += cols) {
    h += (i ? G_GAP : 0) + Math.max(...kids.slice(i, i + cols).map((k) => groupHeight(k, cellW)))
  }
  return h + G_PAD
}

/** @returns {string} */
function groupSvg(
  /** @type {Group} */ g,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ w,
  /** @type {number} */ depth,
  /** @type {number=} */ forceH,
) {
  const h = forceH ?? groupHeight(g, w)
  const accented = g.accent && g.accent !== 'none'
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${NEST_FILL[Math.min(depth, 2)]}" stroke="${stroke(g.accent)}" stroke-width="${accented ? 1.5 : 1}"/>`,
    `<text x="${x + G_PAD}" y="${y + 19}" fill="var(--r-heading)" font-size="13.5">${esc(g.title)}</text>`,
  ]
  if (g.sublabel) {
    parts.push(
      `<text x="${x + G_PAD}" y="${y + 36}" fill="var(--r-muted)" font-size="11" font-family="var(--r-font)">${esc(g.sublabel)}</text>`,
    )
  }
  const top = y + headHeight(g)
  const { cols, cellW } = groupGrid(g, w)
  if (g.items) {
    g.items.forEach((it, i) => {
      const ix = x + G_PAD + (i % cols) * cellW
      const iy = top + Math.floor(i / cols) * ITEM_H + 12
      const fill = it.accent && it.accent !== 'none' ? stroke(it.accent) : 'var(--r-heading)'
      parts.push(`<text x="${ix}" y="${iy}" fill="${fill}" font-size="11.5">${esc(it.name)}</text>`)
      if (it.note) {
        parts.push(
          `<text x="${ix + textWidth(it.name, 11.5) + 8}" y="${iy}" fill="var(--r-muted)" font-size="10" font-family="var(--r-font)">${esc(it.note)}</text>`,
        )
      }
    })
  } else {
    const kids = /** @type {Group[]} */ (g.groups)
    let cy = top
    for (let i = 0; i < kids.length; i += cols) {
      const row = kids.slice(i, i + cols)
      const rh = Math.max(...row.map((k) => groupHeight(k, cellW)))
      row.forEach((k, j) =>
        parts.push(groupSvg(k, x + G_PAD + j * (cellW + G_GAP), cy, cellW, depth + 1, rh)),
      )
      cy += rh + G_GAP
    }
  }
  return parts.join('')
}

/** @returns {string} */
function renderContainment(/** @type {Containment} */ d) {
  const cols = Math.min(d.columns ?? 2, d.groups.length)
  const need = Math.max(...d.groups.map(groupMinWidth)) * cols + G_GAP * (cols - 1)
  const inner = Math.max(W - PAD * 2, need)
  const width = inner + PAD * 2
  const cellW = (inner - G_GAP * (cols - 1)) / cols
  const parts = []
  let y = PAD
  for (let i = 0; i < d.groups.length; i += cols) {
    const row = d.groups.slice(i, i + cols)
    const rh = Math.max(...row.map((g) => groupHeight(g, cellW)))
    row.forEach((g, j) => parts.push(groupSvg(g, PAD + j * (cellW + G_GAP), y, cellW, 0, rh)))
    y += rh + G_GAP
  }
  return svgWrap(parts.join(''), y - G_GAP + PAD, width)
}

const svgWrap = (
  /** @type {string} */ inner,
  /** @type {number} */ height,
  /** @type {number=} */ width,
  /** @type {string=} */ viewBox,
) =>
  `<svg viewBox="${viewBox ?? `0 0 ${Math.round(width ?? W)} ${Math.round(height)}`}" role="img" font-family="var(--r-font-mono)">${inner}</svg>`

/** @returns {string} */
export function renderDiagram(/** @type {Diagram} */ d) {
  switch (d.kind) {
    case 'layers':
      return renderLayers(d)
    case 'pipeline':
      return renderPipeline(d)
    case 'inventory':
      return renderInventory(d)
    case 'containment':
      return renderContainment(d)
    case 'raw':
      return svgWrap(d.svg, 0, undefined, d.viewBox)
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** @returns {string} */
function renderBlock(/** @type {Block} */ b) {
  switch (b.type) {
    case 'p':
      return `<p>${inline(b.text)}</p>`
    case 'ul':
      return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`
    case 'table':
      return (
        `<table><thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      )
    case 'panel':
      return `<div class="panel"><h3>${inline(b.heading)}</h3>${b.blocks.map(renderBlock).join('')}</div>`
    case 'figure':
      return (
        `<figure>${renderDiagram(b.diagram)}<figcaption>${inline(b.caption)}` +
        `${b.cite ? ` <span class="cite">${esc(b.cite)}</span>` : ''}</figcaption></figure>`
      )
  }
}

// ---------------------------------------------------------------------------
// Validation — enough to fail loudly on the mistakes that actually happen
// ---------------------------------------------------------------------------

const DIAGRAM_KINDS = new Set(['layers', 'pipeline', 'inventory', 'containment', 'raw'])
const BLOCK_TYPES = new Set(['p', 'ul', 'table', 'panel', 'figure'])

/** @param {unknown} payload @returns {MapPage} */
export function validate(payload) {
  /** @type {string[]} */
  const errors = []
  const at = (/** @type {string} */ path, /** @type {string} */ msg) =>
    errors.push(`${path}: ${msg}`)

  const page = /** @type {any} */ (payload)
  if (!page || typeof page !== 'object') throw new Error('payload must be an object')
  if (typeof page.title !== 'string') at('title', 'required string')
  if (typeof page.lede !== 'string') at('lede', 'required string')
  if (!Array.isArray(page.sections)) at('sections', 'required array')

  /** @param {any} b @param {string} path */
  const checkBlock = (b, path) => {
    if (!b || !BLOCK_TYPES.has(b.type))
      return at(path, `type must be one of ${[...BLOCK_TYPES].join(', ')}`)
    if (b.type === 'table') {
      const cols = b.head?.length
      b.rows?.forEach((/** @type {any[]} */ r, /** @type {number} */ i) => {
        if (r.length !== cols) at(`${path}.rows[${i}]`, `has ${r.length} cells, head has ${cols}`)
      })
    }
    if (b.type === 'panel')
      b.blocks?.forEach((/** @type {any} */ x, /** @type {number} */ i) =>
        checkBlock(x, `${path}.blocks[${i}]`),
      )
    if (b.type === 'figure') {
      const d = b.diagram
      if (!d || !DIAGRAM_KINDS.has(d.kind))
        return at(`${path}.diagram`, `kind must be one of ${[...DIAGRAM_KINDS].join(', ')}`)
      if (d.kind === 'layers') {
        if (!d.layers?.length) at(`${path}.diagram.layers`, 'needs at least one layer')
        d.layers?.forEach((/** @type {any} */ l, /** @type {number} */ i) => {
          if (!l.boxes?.length) at(`${path}.diagram.layers[${i}]`, 'needs at least one box')
        })
        if (
          d.boundary &&
          (d.boundary.after < 0 || d.boundary.after >= (d.layers?.length ?? 0) - 1)
        ) {
          at(`${path}.diagram.boundary.after`, 'must index a layer that has another layer below it')
        }
      }
      if (d.kind === 'pipeline' && !d.stages?.length)
        at(`${path}.diagram.stages`, 'needs at least one stage')
      if (d.kind === 'inventory' && !d.items?.length)
        at(`${path}.diagram.items`, 'needs at least one item')
      if (d.kind === 'containment') {
        /** A group holds names or more groups, never both, and nests 3 deep at most. */
        const checkGroup = (
          /** @type {any} */ g,
          /** @type {string} */ p,
          /** @type {number} */ depth,
        ) => {
          if (typeof g?.title !== 'string') return at(p, 'needs a title')
          const hasItems = !!g.items?.length
          const hasGroups = !!g.groups?.length
          if (hasItems === hasGroups)
            return at(p, 'needs either items or groups, not both and not neither')
          if (depth > 3) return at(p, 'nests deeper than 3 levels')
          if (hasGroups)
            g.groups.forEach((/** @type {any} */ k, /** @type {number} */ i) =>
              checkGroup(k, `${p}.groups[${i}]`, depth + 1),
            )
          if (hasItems)
            g.items.forEach((/** @type {any} */ it, /** @type {number} */ i) => {
              if (typeof it?.name !== 'string') at(`${p}.items[${i}]`, 'needs a name')
            })
        }
        if (!d.groups?.length) at(`${path}.diagram.groups`, 'needs at least one group')
        d.groups?.forEach((/** @type {any} */ g, /** @type {number} */ i) =>
          checkGroup(g, `${path}.diagram.groups[${i}]`, 1),
        )
      }
      if (d.kind === 'raw' && typeof d.viewBox !== 'string')
        at(`${path}.diagram.viewBox`, 'raw needs an explicit viewBox')
    }
  }

  page.sections?.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (typeof s.heading !== 'string') at(`sections[${i}].heading`, 'required string')
    if (!Array.isArray(s.blocks)) return at(`sections[${i}].blocks`, 'required array')
    s.blocks.forEach((/** @type {any} */ b, /** @type {number} */ j) =>
      checkBlock(b, `sections[${i}].blocks[${j}]`),
    )
  })

  if (errors.length) throw new Error(`invalid MapPage payload:\n  ${errors.join('\n  ')}`)
  return page
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const TOKENS = `
:root {
  --r-font: -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif;
  --r-font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  --r-bg: #f8f8fa; --r-card: #ffffff; --r-surface: #ebebed; --r-chip: #f1f1f5;
  --r-heading: #1a1a1c; --r-text: #45454b; --r-muted: #606066; --r-border: #e0e0e6;
  --r-accent-wash: #e6ebf7; --r-accent-line: #abc0ee;
  --r-success: #196b3a; --r-warning: #865408; --r-error: #a20717;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --r-bg: #16161a; --r-card: #1f1f25; --r-surface: #26262d; --r-chip: #26262d;
    --r-heading: #f2f2f5; --r-text: #c6c6cf; --r-muted: #93939e; --r-border: #33333c;
    --r-accent-wash: #1e2740; --r-accent-line: #3c5490;
    --r-success: #5fcf8e; --r-warning: #e0b264; --r-error: #f2919d;
  }
}
:root[data-theme="dark"] {
  --r-bg: #16161a; --r-card: #1f1f25; --r-surface: #26262d; --r-chip: #26262d;
  --r-heading: #f2f2f5; --r-text: #c6c6cf; --r-muted: #93939e; --r-border: #33333c;
  --r-accent-wash: #1e2740; --r-accent-line: #3c5490;
  --r-success: #5fcf8e; --r-warning: #e0b264; --r-error: #f2919d;
}
`

const LAYOUT = `
* { box-sizing: border-box; }
body { margin:0; padding:0 16px; background:var(--r-bg); color:var(--r-text);
  font-family:var(--r-font); font-size:16px; line-height:1.65; }
h1 { color:var(--r-heading); font-size:30px; margin:0 0 6px; letter-spacing:-0.01em; }
h2 { color:var(--r-heading); font-size:21px; margin:52px 0 12px; scroll-margin-top:20px; letter-spacing:-0.005em; }
h3 { color:var(--r-heading); font-size:15.5px; margin:0 0 8px; }
.lede { color:var(--r-muted); font-size:17px; margin:0 0 6px; }
.meta { color:var(--r-muted); font-size:13px; font-family:var(--r-font-mono); margin-bottom:36px; }
p { margin:0 0 15px; }
code { font-family:var(--r-font-mono); font-size:0.875em; background:var(--r-chip);
  border-radius:4px; padding:1.5px 5px; color:var(--r-heading); }
figure { margin:26px 0; }
figure svg { width:100%; height:auto; display:block; }
figcaption { color:var(--r-muted); font-size:13.5px; margin-top:9px; }
table { width:100%; border-collapse:collapse; margin:18px 0; font-size:14.5px; }
th,td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--r-border); vertical-align:top; }
th { background:var(--r-surface); color:var(--r-heading); font-weight:600; }
ul { margin:0 0 15px; padding-left:21px; } li { margin-bottom:6px; }
.panel { border:1px solid var(--r-accent-line); background:var(--r-accent-wash);
  border-radius:6px; padding:14px 18px; margin:22px 0; }
.panel > :last-child { margin-bottom:0; }
.cite { font-family:var(--r-font-mono); font-size:12.5px; color:var(--r-muted); }
@media (max-width:620px) { h1 { font-size:25px; } }

/* Two columns: a table of contents that holds its place, and the page. */
.shell { display:grid; grid-template-columns:232px minmax(0,1fr); gap:44px;
  max-width:1210px; margin:0 auto; align-items:start; }
.shell.no-toc { display:block; max-width:900px; }
.toc { position:sticky; top:0; align-self:start; max-height:100vh; overflow-y:auto;
  padding:48px 0 40px; font-size:13.5px; line-height:1.5;
  scrollbar-width:thin; scrollbar-color:var(--r-border) transparent; }
.toc::-webkit-scrollbar { width:8px; }
.toc::-webkit-scrollbar-thumb { background:var(--r-border); border-radius:4px; }
.toc-label { color:var(--r-muted); font-size:11px; letter-spacing:0.07em;
  text-transform:uppercase; margin:0 0 10px; }
.toc ol { list-style:none; margin:0; padding:0; border-left:1px solid var(--r-border); }
.toc li { margin:0; }
.toc a { display:block; padding:5px 12px; margin-left:-1px; color:var(--r-muted);
  text-decoration:none; border-left:2px solid transparent; }
.toc a:hover { color:var(--r-heading); }
.toc a.is-current { color:var(--r-heading); border-left-color:var(--r-accent-line); }
.toc code { background:none; padding:0; font-size:0.92em; }
main { padding:48px 0 96px; }
main > h2:first-of-type { margin-top:34px; }

/* One column below the split: the contents lead the page instead of flanking it. */
@media (max-width:900px) {
  .shell { display:block; max-width:900px; }
  .toc { position:static; max-height:31vh; padding:8px 0; }
  .toc ol { border-left:none; display:flex; flex-wrap:wrap; gap:2px 6px; }
  .toc a { padding:3px 9px; border-left:none; border-radius:4px; background:var(--r-surface); }
  .toc a.is-current { background:var(--r-accent-wash); }
  main { padding:24px 0 64px; }
}
`

const STYLE = TOKENS.trimEnd() + LAYOUT

/** Highlights the entry for whichever section the reader is currently in. */
const SPY = `
const map = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.hash.slice(1), a]))
let current = null
const mark = (a) => {
  if (a === current) return
  if (current) current.classList.remove('is-current')
  current = a
  if (!a) return
  a.classList.add('is-current')
  // Keep the marked entry inside the rail's own scroll, without moving the page.
  const nav = a.closest('.toc')
  if (nav.scrollHeight <= nav.clientHeight) return
  const nr = nav.getBoundingClientRect()
  const ar = a.getBoundingClientRect()
  if (ar.top < nr.top + 8) nav.scrollTop += ar.top - nr.top - 8
  else if (ar.bottom > nr.bottom - 8) nav.scrollTop += ar.bottom - nr.bottom + 8
}
const obs = new IntersectionObserver(
  (entries) => {
    const hit = entries.find((e) => e.isIntersecting)
    if (hit) mark(map.get(hit.target.id))
  },
  { rootMargin: '0px 0px -72% 0px' },
)
for (const h of document.querySelectorAll('main > h2[id]')) obs.observe(h)
`

/** @param {MapPage} page @returns {string} */
export function renderMapPage(page) {
  const used = new Set()
  const sections = page.sections.map((s) => ({ ...s, id: slug(s.heading, used) }))
  const body = sections
    .map(
      (s) => `<h2 id="${s.id}">${inline(s.heading)}</h2>\n${s.blocks.map(renderBlock).join('\n')}`,
    )
    .join('\n\n')
  // One or two headings navigate fine on their own; a contents rail would only crowd them.
  const toc =
    sections.length < 3
      ? ''
      : `<nav class="toc" aria-label="Contents">
<p class="toc-label">Contents</p>
<ol>
${sections.map((s) => `<li><a href="#${s.id}">${inline(s.heading)}</a></li>`).join('\n')}
</ol>
</nav>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} — structural map</title>
<style>${STYLE}</style>
</head>
<body>
<div class="shell${toc ? '' : ' no-toc'}">
${toc}
<main>
<h1>${esc(page.title)}</h1>
<p class="lede">${inline(page.lede)}</p>
${page.meta ? `<p class="meta">${esc(page.meta)}</p>` : ''}

${body}
</main>
</div>
${toc ? `<script>${SPY}</script>` : ''}
</body>
</html>
`
}

// Only when run as a command; importing this file must not render anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output) {
    console.error('usage: node render_map.mjs <payload.json> <out.html>')
    process.exit(2)
  }
  const page = validate(JSON.parse(readFileSync(input, 'utf8')))
  writeFileSync(output, renderMapPage(page))
  console.error(`MAP-RENDER ok sections=${page.sections.length} out=${output}`)
}
