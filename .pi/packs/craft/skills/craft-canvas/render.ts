#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas render — turn one document JSON into a self-contained HTML page.
 *
 *   bun render.ts <doc.json> [--out <file.html>] [--link <href>=<label>]...
 *
 * Runs unchanged under bun, node 22+ (type stripping) and deno. No deps.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import type { CanvasDoc } from './lib/compose.ts'
import { renderDoc } from './lib/compose.ts'

if (import.meta.main ?? process.argv[1]?.endsWith('render.ts')) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { out: { type: 'string', short: 'o' }, link: { type: 'string', multiple: true } },
  })
  const file = positionals[0]
  if (!file) {
    console.error('usage: render.ts <doc.json> [--out file.html] [--link href=label]...')
    process.exit(2)
  }
  const doc = JSON.parse(readFileSync(file, 'utf8')) as CanvasDoc
  const links = (values.link ?? []).map((l) => {
    const [href, label] = l.split('=')
    return { href, label: label ?? href }
  })
  const html = renderDoc(doc, links)
  if (values.out) writeFileSync(values.out, html)
  else process.stdout.write(html)
}
