import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { ProseBlock } from './types.ts'

export function render(b: ProseBlock): BlockOut {
  const left = `<div class="prose-block" data-node="${escapeHtml(b.id)}">${prose(b.text)}</div>`
  const title = b.title ?? b.text.split(/\s+/).slice(0, 6).join(' ')
  return {
    left,
    sections: [
      { id: b.id, title, html: `<h2>${escapeHtml(title)}</h2>${prose(b.text)}`, source: b.source },
    ],
  }
}

export function check(b: ProseBlock): string[] {
  return b.text?.trim() ? [] : [`prose ${b.id}: text is required`]
}
