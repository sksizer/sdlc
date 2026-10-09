/**
 * Compose a document's blocks into one page, and check a document as a whole:
 * every block type known, every id unique across blocks, every question about
 * a node that exists.
 */
import { blockModule } from '../blocks/index.ts'
import type { Block } from '../blocks/types.ts'
import type { DocMeta, Position, Question, Section } from './doc.ts'
import { escapeHtml, sourceLinks } from './doc.ts'
import type { Page } from './shell.ts'
import { renderPage } from './shell.ts'

export interface CanvasDoc extends DocMeta {
  blocks: Block[]
}

export function compose(doc: CanvasDoc, links?: Page['links']): Page {
  const lefts: string[] = []
  const nav: Section[] = []
  let titles: Record<string, string> = {}
  for (const b of doc.blocks) {
    const mod = blockModule(b.type)
    if (!mod) throw new Error(`block ${b.id}: unknown type "${b.type}"`)
    const out = mod.render(b)
    lefts.push(`<section class="block" id="block-${escapeHtml(b.id)}" data-block="${escapeHtml(b.id)}">${b.title ? `<div class="block-title">${escapeHtml(b.title)}</div>` : ''}${sourceLinks(b.source, doc.repo)}${out.left}</section>`)
    const label = b.title ?? b.type
    nav.push(...out.sections.map((sec) => ({ ...sec, block: label, blockId: b.id })))
    titles = { ...titles, ...out.titles }
  }
  const kinds = [...new Set(doc.blocks.map((b) => b.type))].join(' · ')
  return { meta: doc, kindLabel: `Canvas · ${kinds}`, left: lefts.join('\n'), nav, titles, links }
}

export function renderDoc(doc: CanvasDoc, links?: Page['links']): string {
  return renderPage(compose(doc, links))
}

const ID = /^[a-z0-9][a-z0-9-]*$/

export function checkDoc(doc: CanvasDoc, fileStem?: string): string[] {
  const errors: string[] = []
  if (!ID.test(doc.id ?? '')) errors.push(`id "${doc.id}" must be lowercase letters, digits and hyphens`)
  if (fileStem && doc.id !== fileStem) errors.push(`id "${doc.id}" must match the file name "${fileStem}"`)
  if (!doc.title) errors.push('title is required')
  if (!doc.created) errors.push('created is required')
  if (!Array.isArray(doc.blocks) || !doc.blocks.length) {
    errors.push('blocks must be a non-empty list')
    return errors
  }
  if (doc.repo) {
    if (!/^https?:\/\//.test(doc.repo.remote ?? '')) errors.push('repo.remote must be an https URL')
    if (!/^[0-9a-f]{7,40}$/.test(doc.repo.commit ?? '')) errors.push('repo.commit must be a commit sha')
  }
  for (const b of doc.blocks) errors.push(...checkSources(b, `block ${b.id}`))
  const ids = new Map<string, string>()
  const node = (id: string | undefined, where: string) => {
    if (!id) return errors.push(`${where}: missing id`)
    if (ids.has(id)) errors.push(`${where}: id "${id}" already used by ${ids.get(id)}`)
    ids.set(id, where)
  }
  for (const b of doc.blocks) {
    node(b.id, `block ${b.id ?? '?'}`)
    const mod = blockModule(b.type)
    if (!mod) {
      errors.push(`block ${b.id}: unknown type "${b.type}"`)
      continue
    }
    errors.push(...mod.check(b))
    const sections = safeSections(mod, b)
    // A one-section block (prose) may name its section after itself.
    for (const s of sections) if (s.id !== b.id) node(s.id, `${b.type} ${b.id} / ${s.title}`)
    for (const id of mod.nodeIds?.(b) ?? []) node(id, `${b.type} ${b.id} / ${id}`)
  }
  for (const q of doc.questions ?? []) {
    node(q.id, `question ${q.id ?? '?'}`)
    errors.push(...checkQuestion(q, ids))
  }
  return errors
}

/** Every `source` on a block and the nodes it holds must be a Location: a uri and, if present, a zero-based range. */
function checkSources(value: unknown, where: string): string[] {
  const errors: string[] = []
  const visit = (v: unknown, w: string) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${w}[${i}]`))
    const o = v as Record<string, unknown>
    if ('source' in o && o.source !== undefined) {
      const list = Array.isArray(o.source) ? o.source : [o.source]
      for (const src of list as Record<string, unknown>[]) {
        const name = typeof o.id === 'string' ? o.id : w
        if (!src || typeof src.uri !== 'string' || !src.uri) errors.push(`${name}: source.uri is required`)
        const r = src.range as { start?: Position; end?: Position } | undefined
        if (r) {
          const ok = (pos?: Position) => pos && Number.isInteger(pos.line) && pos.line >= 0 && Number.isInteger(pos.character) && pos.character >= 0
          if (!ok(r.start) || !ok(r.end)) errors.push(`${name}: source.range needs zero-based start and end {line, character}`)
        }
      }
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'source') visit(x, `${w}.${k}`)
  }
  visit(value, where)
  return errors
}

/** Section ids without rendering the whole block when its anchors are broken. */
function safeSections(mod: ReturnType<typeof blockModule> & object, b: Block): Section[] {
  try {
    return mod.render(b).sections
  } catch {
    if (b.type === 'annotated-text') return b.steps.map((s) => ({ id: s.id, title: s.title, html: '' }))
    return []
  }
}

function checkQuestion(q: Question, ids: Map<string, string>): string[] {
  const errors: string[] = []
  const where = `question ${q.id}`
  if (!q.prompt) errors.push(`${where}: prompt is required`)
  if (!['single', 'multi', 'text'].includes(q.kind)) errors.push(`${where}: kind must be single, multi or text`)
  if (q.kind === 'text' && q.options?.length) errors.push(`${where}: a text question has no options`)
  if (q.kind !== 'text' && !q.options?.length) errors.push(`${where}: needs options`)
  if (q.recommended && !q.options?.some((o) => o.id === q.recommended)) errors.push(`${where}: recommended "${q.recommended}" is not an option`)
  if (q.about && !ids.has(q.about)) errors.push(`${where}: about "${q.about}" names no node`)
  return errors
}
