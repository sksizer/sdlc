#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas check — validate one or more documents. Prints one line per file
 * and one indented line per problem; exits 1 when any file fails.
 *
 *   bun check.ts docs/canvas/*.json
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import type { CanvasDoc } from './lib/compose.ts'
import { checkDoc } from './lib/compose.ts'

export function checkFile(path: string): string[] {
  let doc: CanvasDoc
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    return [`not valid JSON: ${e instanceof Error ? e.message : String(e)}`]
  }
  return checkDoc(doc, basename(path).replace(/\.json$/, ''))
}

const files = process.argv.slice(2).filter((f) => !f.endsWith('.answers.json'))
if (!files.length) {
  console.error('usage: check.ts <doc.json>...')
  process.exit(2)
}
let failed = false
for (const f of files) {
  const errors = checkFile(f)
  if (errors.length) {
    failed = true
    console.log(`${f}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`)
    for (const e of errors) console.log(`  - ${e}`)
  } else console.log(`${f}: ok`)
}
process.exit(failed ? 1 : 0)
