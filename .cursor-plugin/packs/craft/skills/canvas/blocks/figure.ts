/** One image with a caption, served from the document's folder. The walkthrough carries the detail. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import { parts } from '../lib/markdown.ts'
import type { FigureBlock } from './types.ts'

/** A safe relative path: no scheme, no leading slash, no `..` segment. */
export function safeSrc(src: string | undefined): boolean {
  return !!src && !/^[a-z]+:/i.test(src) && !src.startsWith('/') && !src.split('/').includes('..')
}

export function render(b: FigureBlock): BlockOut {
  const left = `<figure class="fig" data-node="${escapeHtml(b.id)}"><img src="x/${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}" loading="lazy">${
    b.caption || b.href
      ? `<figcaption>${escapeHtml(b.caption ?? '')}${b.href ? ` <a href="${escapeHtml(b.href)}" target="_blank" rel="noopener">Open the live version ↗</a>` : ''}</figcaption>`
      : ''
  }</figure>`
  const title = b.title ?? b.caption ?? b.alt
  const detail = prose(b.detail)
  return {
    left,
    sections: [
      {
        id: b.id,
        title,
        html: detail ? `<h2>${escapeHtml(title)}</h2>${detail}` : '',
        source: b.source,
      },
    ],
  }
}

export function check(b: FigureBlock): string[] {
  const errors: string[] = []
  if (!safeSrc(b.src))
    errors.push(`figure ${b.id}: src must be a relative path inside the document's folder`)
  if (!b.alt) errors.push(`figure ${b.id}: alt is required`)
  return errors
}

export function markdown(b: FigureBlock): string {
  return parts(
    `![${b.alt}](${b.src})`,
    b.caption ? `*${b.caption}*${b.href ? ` ([live](${b.href}))` : ''}` : '',
    b.detail,
  )
}
