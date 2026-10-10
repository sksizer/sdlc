#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas render — turn one document JSON into a self-contained HTML page.
 *
 *   bun render.ts <doc.json> [--out <file.html|file.md>] [--format html|markdown] [--link <href>=<label>]...
 *
 * Markdown is the same document as headings, lists, tables and mermaid fences, for a PR
 * body or a README; the format follows --format, else the --out extension, else html.
 *
 * Runs unchanged under bun, node 22+ (type stripping) and deno. No deps.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import type { CanvasDoc } from './lib/compose.ts'
import { renderDoc } from './lib/compose.ts'
import { renderMarkdown } from './lib/markdown.ts'

if (import.meta.main ?? process.argv[1]?.endsWith('render.ts')) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      format: { type: 'string', short: 'f' },
      link: { type: 'string', multiple: true },
    },
  })
  const file = positionals[0]
  if (!file) {
    console.error(
      'usage: render.ts <doc.json> [--out file.html|file.md] [--format html|markdown] [--link href=label]...',
    )
    process.exit(2)
  }
  const doc = JSON.parse(readFileSync(file, 'utf8')) as CanvasDoc
  const links = (values.link ?? []).map((l) => {
    const [href = '', label] = l.split('=')
    return { href, label: label ?? href }
  })
  const format = values.format ?? (values.out?.endsWith('.md') ? 'markdown' : 'html')
  if (!['html', 'markdown', 'md'].includes(format)) {
    console.error(`format must be html or markdown, not "${format}"`)
    process.exit(2)
  }
  const text = format === 'html' ? renderDoc(doc, links) : renderMarkdown(doc)
  if (values.out) writeFileSync(values.out, text)
  else process.stdout.write(text)
}
