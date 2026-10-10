#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas serve — the servlet. Serves every `<id>.json` in a folder as a
 * rendered page and persists answers beside it as `<id>.answers.json`.
 *
 *   bun serve.ts [dir] [--port 4321] [--host 0.0.0.0] [--root <path>]
 *     dir defaults to docs/canvas; host defaults to 127.0.0.1 (loopback only).
 *     root is the project whose files the pages link to; it defaults to the git checkout holding dir.
 *     Pass --host 0.0.0.0 to review from another machine on the LAN; there is no auth, and the
 *     tracked files are served, so a committed secret (a tracked .env or key) would be readable.
 *     Requests are checked against the Host header (DNS rebinding): only 127.0.0.1, localhost,
 *     [::1] and the --host value pass, except with --host 0.0.0.0 or ::, where any Host does.
 *
 *   GET  /            index of documents
 *   GET  /d/<id>      the rendered page
 *   GET  /a/<id>      answers JSON (empty answers if none yet)
 *   PUT  /a/<id>      replace answers JSON
 *   GET  /events      server-sent events: {kind: "doc" | "answers", id} when a file changes
 *   GET  /f/<path>    a project file read-only: .md rendered (?view=source for its lines), anything else as
 *                     numbered source; #L12-L20 highlights; images and PDFs as themselves;
 *                     ?part=body is the body alone, for the page's file viewer. Only files
 *                     git lists (tracked or untracked, not ignored), so nothing is served outside a git
 *                     checkout; text at most 1 MB, media 25 MB; always nosniff, media sandboxed.
 *   GET  /w/<name>    a [[wikilink]]: redirects to /f/<path> when a <name>.md exists in the project
 *   GET  /resolve?n=…&from=<dir>  which [[wikilinks]] resolve, as {name: path | null}; the page unlinks the rest
 *
 * node:http so it runs under bun, node and deno unchanged. Pages are rendered
 * on every request and the folder is watched, so when an agent rewrites a
 * document the open page reloads itself, and when it rewrites the answers the
 * page re-reads them. The loop is: agent writes, reviewer answers, agent reads.
 */
import { existsSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

import { encodePath, emptyAnswers } from './lib/doc.ts'
import { fileBody, filePage } from './lib/file-view.ts'
import { ProjectFiles, projectRoot } from './lib/files.ts'
import { indexPage, type IndexEntry } from './lib/index-page.ts'
import type { CanvasDoc } from './lib/compose.ts'
import { renderDoc } from './lib/compose.ts'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    port: { type: 'string', default: '4321' },
    host: { type: 'string', default: '127.0.0.1' },
    root: { type: 'string' },
  },
})
const dir = resolve(positionals[0] ?? 'docs/canvas')
const port = Number(values.port)
const host = values.host
const root = resolve(values.root ?? projectRoot(dir))
const files = new ProjectFiles(root)
const ID = /^[a-z0-9][a-z0-9-]*$/
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/** The hostnames a request may name; with a wildcard bind (LAN mode) any Host is accepted. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', host, `[${host}]`])
const ANY_HOST = host === '0.0.0.0' || host === '::'
function hostAllowed(header: string | undefined): boolean {
  if (ANY_HOST) return true
  if (!header) return false
  const name = header.startsWith('[')
    ? header.slice(0, header.indexOf(']') + 1)
    : header.split(':')[0]!
  return LOCAL_HOSTS.has(name.toLowerCase())
}
/** `decodeURIComponent` that gives undefined on a malformed escape, which the caller answers with 400. */
function decodePath(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}

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
/** One row of the index: the document, its kinds, its verdict and how far its questions are. */
function readEntry(id: string): IndexEntry {
  const doc = readDoc(id)
  const a = existsSync(answersPath(id))
    ? JSON.parse(readFileSync(answersPath(id), 'utf8'))
    : emptyAnswers(id)
  const qs = [
    ...(doc.questions ?? []),
    ...doc.blocks.flatMap((b) => (b.type === 'question' ? b.questions : [])),
  ]
  const answered = qs.filter((q) => {
    const c = a.choices?.[q.id]
    return !!c && !c.ask && (c.selected?.length || c.note)
  }).length
  return {
    id,
    title: doc.title,
    summary: doc.summary,
    kinds: [...new Set(doc.blocks.map((b) => b.type))],
    status: a.status ?? 'reviewing',
    questions: qs.length,
    answered,
    comments: (a.comments ?? []).length,
    updated: a.updated && a.updated > doc.created ? a.updated : undefined,
    created: doc.created,
  }
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
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(403, { 'content-type': 'text/plain' })
    return res.end('forbidden host')
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const [, area, id] = url.pathname.split('/')
  const send = (code: number, body: string, type = 'text/html; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  }
  try {
    if (url.pathname === '/') return send(200, indexPage(dir, docIds().map(readEntry)))
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
    const xAt = url.pathname.startsWith('/x/') ? 3 : url.pathname.startsWith('/d/x/') ? 5 : 0
    if (xAt && req.method === 'GET') {
      // An image from the x/ folder beside the documents, for figure blocks; nothing outside it. The page
      // lives at /d/<id>, so its relative `x/…` resolves to /d/x/…; a rendered page beside the folder uses x/ directly.
      const rel = decodeURIComponent(url.pathname.slice(xAt))
      const ext = rel.split('.').pop()?.toLowerCase() ?? ''
      const type = IMAGE_TYPES[ext]
      const file = resolve(dir, 'x', rel)
      if (
        !type ||
        rel.split('/').includes('..') ||
        !file.startsWith(join(dir, 'x') + sep) ||
        !existsSync(file)
      )
        return send(404, 'not found', 'text/plain')
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
      return res.end(readFileSync(file))
    }
    if (url.pathname === '/resolve') {
      const names = url.searchParams.getAll('n').slice(0, 500)
      const from = url.searchParams.get('from') ?? ''
      return send(
        200,
        JSON.stringify(Object.fromEntries(names.map((n) => [n, files.resolve(n, from) ?? null]))),
        'application/json',
      )
    }
    if (area === 'w' && req.method === 'GET') {
      const name = decodePath(url.pathname.slice(3))
      if (name === undefined) return send(400, 'malformed path', 'text/plain')
      const rel = files.resolve(name)
      if (!rel) return send(404, 'no such file in this project', 'text/plain')
      res.writeHead(302, { location: `/f/${encodePath(rel)}` })
      return res.end()
    }
    if (area === 'f' && req.method === 'GET') {
      // nosniff on every /f/ response; media is also sandboxed so an SVG cannot run script in this origin.
      res.setHeader('x-content-type-options', 'nosniff')
      const rel = decodePath(url.pathname.slice(3))
      if (rel === undefined) return send(400, 'malformed path', 'text/plain')
      const file = files.file(rel)
      if (!file)
        return send(
          404,
          'not served: missing, ignored by git, binary (images and PDFs excepted) or too large',
          'text/plain',
        )
      if (file.media) {
        res.writeHead(200, {
          'content-type': file.media,
          'cache-control': 'no-store',
          'content-security-policy': 'sandbox',
        })
        return res.end(readFileSync(file.path))
      }
      const text = readFileSync(file.path, 'utf8')
      const view = url.searchParams.get('view') ?? undefined
      // ?part=body is the canvas page's viewer asking for the body alone.
      return send(
        200,
        url.searchParams.get('part') === 'body'
          ? fileBody(rel, text, view)
          : filePage(rel, text, view),
      )
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
if (!files.listed)
  console.warn(
    `canvas: ${root} is not a git checkout, so no project files are served (pass --root)`,
  )
server.listen(port, host, () =>
  console.log(
    `canvas: http://${host === '0.0.0.0' ? '<this machine>' : host}:${port}/  (${dir}; files from ${root})`,
  ),
)
