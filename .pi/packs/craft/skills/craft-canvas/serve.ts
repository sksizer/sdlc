#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas serve — the servlet. Serves every `<id>.json` in a folder as a
 * rendered page and persists answers beside it as `<id>.answers.json`.
 *
 *   bun serve.ts [dir] [--port 4321] [--host 0.0.0.0]
 *     dir defaults to docs/canvas; host defaults to 127.0.0.1 (loopback only).
 *     Pass --host 0.0.0.0 to review from another machine on the LAN; there is no auth.
 *
 *   GET  /            index of documents
 *   GET  /d/<id>      the rendered page
 *   GET  /a/<id>      answers JSON (empty answers if none yet)
 *   PUT  /a/<id>      replace answers JSON
 *   GET  /events      server-sent events: {kind: "doc" | "answers", id} when a file changes
 *
 * node:http so it runs under bun, node and deno unchanged. Pages are rendered
 * on every request and the folder is watched, so when an agent rewrites a
 * document the open page reloads itself, and when it rewrites the answers the
 * page re-reads them. The loop is: agent writes, reviewer answers, agent reads.
 */
import { existsSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { emptyAnswers, escapeHtml } from './lib/doc.ts'
import type { CanvasDoc } from './lib/compose.ts'
import { renderDoc } from './lib/compose.ts'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    port: { type: 'string', default: '4321' },
    host: { type: 'string', default: '127.0.0.1' },
  },
})
const dir = resolve(positionals[0] ?? 'docs/canvas')
const port = Number(values.port)
const host = values.host
const ID = /^[a-z0-9][a-z0-9-]*$/

function docIds(): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.answers.json'))
    .map((f) => f.slice(0, -5))
    .filter((id) => ID.test(id))
    .sort()
}
function readDoc(id: string): CanvasDoc {
  return JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'))
}
function answersPath(id: string): string {
  return join(dir, `${id}.answers.json`)
}

// ---- change notifications
const clients = new Set<ServerResponse>()
let pending = new Map<string, NodeJS.Timeout>()
function notify(file: string) {
  const m = /^([a-z0-9][a-z0-9-]*?)(\.answers)?\.json$/.exec(file)
  if (!m) return
  const key = file
  clearTimeout(pending.get(key))
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      const payload = JSON.stringify({ kind: m[2] ? 'answers' : 'doc', id: m[1] })
      for (const c of clients) c.write(`data: ${payload}\n\n`)
    }, 120),
  )
}
if (existsSync(dir)) watch(dir, (_event, file) => file && notify(String(file)))

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const [, area, id] = url.pathname.split('/')
  const send = (code: number, body: string, type = 'text/html; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  }
  try {
    if (url.pathname === '/') {
      const ids = docIds()
      const rows = ids.map((d) => {
        const doc = readDoc(d)
        const answered = existsSync(answersPath(d))
          ? JSON.parse(readFileSync(answersPath(d), 'utf8')).status
          : 'draft'
        const kinds = [...new Set((doc.blocks ?? []).map((b) => b.type))].join(' · ')
        return `<li><a href="/d/${d}">${escapeHtml(doc.title)}</a> <small>${escapeHtml(kinds)} · ${escapeHtml(answered)}</small></li>`
      })
      return send(
        200,
        `<!doctype html><meta charset="utf-8"><title>canvas</title><body style="font:15px system-ui;padding:24px"><h1>canvas · ${escapeHtml(dir)}</h1><ul>${rows.join('')}</ul>`,
      )
    }
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (!id || !ID.test(id)) return send(404, 'not found', 'text/plain')
    if (area === 'd' && req.method === 'GET') {
      const links = docIds()
        .filter((d) => d !== id)
        .map((d) => ({ href: `/d/${d}`, label: readDoc(d).title }))
      return send(200, renderDoc(readDoc(id), [{ href: '/', label: 'All documents' }, ...links]))
    }
    if (area === 'a' && req.method === 'GET') {
      const p = answersPath(id)
      return send(
        200,
        existsSync(p) ? readFileSync(p, 'utf8') : JSON.stringify(emptyAnswers(id)),
        'application/json',
      )
    }
    if (area === 'a' && req.method === 'PUT') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const parsed = JSON.parse(body)
        if (parsed.doc !== id) return send(400, 'doc id mismatch', 'text/plain')
        writeFileSync(answersPath(id), JSON.stringify(parsed, null, 2) + '\n')
        send(204, '')
      })
      return
    }
    send(404, 'not found', 'text/plain')
  } catch (e) {
    send(500, String(e instanceof Error ? e.message : e), 'text/plain')
  }
})
server.listen(port, host, () =>
  console.log(`canvas: http://${host === '0.0.0.0' ? '<this machine>' : host}:${port}/  (${dir})`),
)
