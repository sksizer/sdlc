/**
 * The markdown rendering of a document: the same typed data as the page, written
 * as headings, lists, tables and mermaid fences so it reads in a PR body, a
 * README or any markdown viewer with no runtime. Each block contributes its own
 * `markdown(b)`; this file writes the envelope and the questions.
 */
import { blockModule } from '../blocks/index.ts'
import type { CanvasDoc } from './compose.ts'
import type { Question, Source } from './doc.ts'

/** `path:L12` for a source, or the list of them. */
export function loc(source: Source | Source[] | undefined): string {
  if (!source) return ''
  const list = Array.isArray(source) ? source : [source]
  return list.map((s) => `\`${s.uri}${s.range ? `:L${s.range.start.line + 1}` : ''}\``).join(', ')
}

export function fence(code: string | undefined, lang = ''): string {
  if (!code) return ''
  const ticks = code.includes('```') ? '````' : '```'
  return `${ticks}${lang}\n${code.replace(/\n$/, '')}\n${ticks}`
}

/** Paragraphs as given, blank line separated. */
export function para(text: string | undefined): string {
  return text?.trim() ?? ''
}

/** One markdown table. Cells are escaped for the pipe. */
export function table(header: string[], rows: string[][]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return `| ${header.map(cell).join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`
}

/** Indent a list item's body under its marker; blank lines stay empty. */
export function indent(body: string): string {
  return body
    .trim()
    .split('\n')
    .map((l) => (l.trim() ? '   ' + l : ''))
    .join('\n')
}

/** Join list items; a blank line separates two when the first ends in a fence, which the formatter wants. */
export function items(list: string[]): string {
  return list
    .map((it, i) => (i < list.length - 1 && /```\s*$/.test(it) ? it + '\n' : it))
    .join('\n')
}

/** Join the non-empty parts with a blank line between them; a part keeps its own indentation. */
export function parts(...xs: (string | undefined | false)[]): string {
  return xs
    .filter((x): x is string => !!x && !!x.trim())
    .map((x) => x.replace(/^\n+|\s+$/g, ''))
    .join('\n\n')
}

export function questionMarkdown(q: Question, n: number): string {
  const head = `${n}. **${q.prompt}**${q.about ? ` _(about \`${q.about}\`)_` : ''}`
  if (q.kind === 'text') return `${head}\n   - _free text_`
  const opts = (q.options ?? []).map(
    (o) =>
      `   - [ ] ${o.label}${o.id === q.recommended ? ' **(recommended)**' : ''}${o.detail ? ` — ${o.detail}` : ''}`,
  )
  return [head, q.kind === 'multi' ? '   _choose any_' : '', ...opts].filter(Boolean).join('\n')
}

export function renderMarkdown(doc: CanvasDoc): string {
  const out: string[] = [`# ${doc.title}`]
  if (doc.summary) out.push(doc.summary)
  const meta = [
    `Created ${doc.created}`,
    doc.repo ? `<${doc.repo.remote}> at \`${doc.repo.commit.slice(0, 10)}\`` : '',
    doc.author?.agent ? `by ${doc.author.agent}` : '',
  ].filter(Boolean)
  out.push(`_${meta.join(' · ')}_`)
  for (const b of doc.blocks) {
    const mod = blockModule(b.type)
    if (!mod) throw new Error(`block ${b.id}: unknown type "${b.type}"`)
    out.push(`## ${b.title ?? b.type}`)
    out.push(mod.markdown(b).trimEnd())
  }
  if (doc.questions?.length) {
    out.push('## Questions')
    out.push(doc.questions.map((q, i) => questionMarkdown(q, i + 1)).join('\n'))
  }
  return out.join('\n\n') + '\n'
}
