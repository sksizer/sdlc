/**
 * How one project file looks in the browser: a markdown file rendered, anything else as numbered,
 * coloured source, plus the styles and the wikilink script the canvas page shares. Pure string
 * building, no file or process access: `lib/files.ts` decides what may be served and reads it.
 */
import { highlightLines } from './highlight.ts'
import { escapeHtml, linkTarget, wikilinkHtml } from './doc.ts'

/**
 * Inline marks: code, wikilinks, links, strong, emphasis. A wikilink is emitted with its /w/ href; the
 * page resolves it through /resolve and rewrites the href, and /w/ is the fallback when no script runs.
 */
function inline(s: string, fromRel: string): string {
  const codes: string[] = []
  let t = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`)
    return `\uE000${codes.length - 1}\uE000`
  })
  t = escapeHtml(t)
    .replace(/\[\[([^\]]+)\]\]/g, (_m, n: string) => wikilinkHtml(n))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
      const t = linkTarget(src, fromRel)
      return t?.kind === 'web' || t?.kind === 'repo' ? `<img src="${t.href}" alt="${alt}">` : alt
    })
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const t = linkTarget(href, fromRel)
      if (!t) return label || href
      return `<a href="${t.href}"${t.kind === 'web' ? ' target="_blank" rel="noopener"' : ''}>${label || href}</a>`
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
  return t.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codes[Number(i)]!)
}

function table(rows: string[], fromRel: string): string {
  const cells = (r: string) =>
    r
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => inline(c.trim().replace(/\\\|/g, '|'), fromRel))
  const [head, , ...body] = rows
  return `<table><thead><tr>${cells(head!)
    .map((c) => `<th>${c}</th>`)
    .join('')}</tr></thead><tbody>${body
    .map(
      (r) =>
        `<tr>${cells(r)
          .map((c) => `<td>${c}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`
}

/**
 * A small markdown renderer for reading planning notes: frontmatter, headings, paragraphs,
 * bullet and numbered lists, fences, block quotes, tables and rules. Not CommonMark; enough
 * to read a decision or a task without leaving the page.
 */
export function renderMarkdownFile(text: string, fromRel: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) {
      const fm = escapeHtml(lines.slice(1, end).join('\n')).replace(
        /\[\[([^\]]+)\]\]/g,
        (_m, n: string) => wikilinkHtml(n),
      )
      out.push(`<pre class="frontmatter">${fm}</pre>`)
      i = end + 1
    }
  }
  const isBlockStart = (l: string) =>
    /^(#{1,6}\s|```|~~~|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\|)/.test(l) || /^(-{3,}|\*{3,})\s*$/.test(l)
  while (i < lines.length) {
    const l = lines[i]!
    if (!l.trim()) {
      i++
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h) {
      const slug = h[2]!
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
      out.push(`<h${h[1]!.length} id="${slug}">${inline(h[2]!, fromRel)}</h${h[1]!.length}>`)
      i++
      continue
    }
    const fence = /^(```+|~~~+)\s*(\S*)/.exec(l)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith(fence[1]!)) body.push(lines[i++]!)
      i++
      out.push(
        `<pre${fence[2] ? ` data-lang="${escapeHtml(fence[2])}"` : ''}><code>${escapeHtml(body.join('\n'))}</code></pre>`,
      )
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      out.push('<hr>')
      i++
      continue
    }
    if (l.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i]!.startsWith('|')) rows.push(lines[i++]!)
      out.push(rows.length > 1 ? table(rows, fromRel) : `<p>${inline(rows[0]!, fromRel)}</p>`)
      continue
    }
    if (/^>\s?/.test(l)) {
      const body: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i]!))
        body.push(lines[i++]!.replace(/^>\s?/, ''))
      out.push(`<blockquote>${renderMarkdownFile(body.join('\n'), fromRel)}</blockquote>`)
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l)
    if (li) {
      const ordered = /\d/.test(li[2]!)
      const items: string[] = []
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]!)
        if (m) {
          const depth = m[1]!.length >= 2 ? ' class="nested"' : ''
          const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]!)
          const body = task
            ? `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2]!, fromRel)}`
            : inline(m[3]!, fromRel)
          items.push(`<li${depth}>${body}</li>`)
          i++
        } else if (lines[i]!.trim() && /^\s+/.test(lines[i]!) && items.length) {
          items[items.length - 1] = items[items.length - 1]!.replace(
            /<\/li>$/,
            ` ${inline(lines[i]!.trim(), fromRel)}</li>`,
          )
          i++
        } else break
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !(para.length && isBlockStart(lines[i]!)))
      para.push(lines[i++]!.trim())
    out.push(`<p>${inline(para.join(' '), fromRel)}</p>`)
  }
  return out.join('\n')
}

/** A text file as numbered, coloured lines; each line is `#L<n>` so a source range can point into it. */
function codeView(text: string, rel: string): string {
  const rows = highlightLines(text.replace(/\r\n/g, '\n').replace(/\n$/, ''), rel).map(
    (l, i) =>
      `<tr id="L${i + 1}"><td class="ln"><a href="#L${i + 1}">${i + 1}</a></td><td class="lc">${l || ' '}</td></tr>`,
  )
  return `<table class="code"><tbody>${rows.join('')}</tbody></table>`
}

/**
 * The styles of a file's body, scoped to `.fileview` so the canvas page can show the same body
 * in its viewer. Uses the page tokens (`--fg`, `--code-bg`, …) plus `--kw` and `--hl`.
 */
export const FILE_CSS = `
.fileview { overflow-wrap: anywhere; }
.fileview h1 { font-size: 22px; letter-spacing: -.01em; } .fileview h2 { font-size: 17px; margin-top: 1.6em; } .fileview h3 { font-size: 15px; }
.fileview a { color: var(--accent); }
.fileview a.wikilink { text-decoration: none; border-bottom: 1px solid currentColor; }
.fileview a.wikilink.missing { color: var(--muted); border-bottom-style: dotted; cursor: default; }
.fileview code { font: 0.9em var(--mono); background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
.fileview pre { background: var(--code-bg); padding: 10px 12px; border-radius: 6px; overflow-x: auto; font: 12.5px/1.5 var(--mono); }
.fileview pre code { background: none; padding: 0; }
.fileview pre.frontmatter { color: var(--muted); border: 1px dashed var(--line-strong); background: transparent; }
.fileview blockquote { margin: 0; padding: 0 14px; border-left: 3px solid var(--line-strong); color: var(--muted); }
.fileview.md table { border-collapse: collapse; display: block; overflow-x: auto; margin: 12px 0; font-size: 13px; }
.fileview.md th, .fileview.md td { border: 1px solid var(--line-strong); padding: 5px 9px; text-align: left; vertical-align: top; }
.fileview.md th { background: var(--code-bg); }
.fileview li.nested { margin-left: 22px; }
.fileview img { max-width: 100%; }
.fileview hr { border: 0; border-top: 1px solid var(--line-strong); margin: 22px 0; }
.fileview.source { overflow-x: auto; overflow-wrap: normal; }
.fileview table.code { border-collapse: collapse; font: 12.5px/1.55 var(--mono); width: 100%; }
.fileview table.code td { padding: 0 14px 0 0; vertical-align: top; white-space: pre; }
.fileview table.code td.ln { width: 1%; padding: 0 12px 0 16px; text-align: right; user-select: none; }
.fileview table.code td.ln a { color: var(--muted); text-decoration: none; }
.fileview table.code tr.hl { background: var(--hl); }
.fileview table.code tr.hl td.ln a { color: var(--fg); }
.fileview { --tk-cm: #6e7781; --tk-str: #0a7a3e; --tk-num: #b35900; --tk-kw: #8a2be2; --tk-ty: #0b7285; --tk-fn: #0550ae; --tk-key: #a3313a; --tk-var: #8a5a00; --tk-tag: #116329; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .fileview { --tk-cm: #8b949e; --tk-str: #7ee2a8; --tk-num: #ffb86b; --tk-kw: #d2a8ff; --tk-ty: #66d9e8; --tk-fn: #79c0ff; --tk-key: #ff9492; --tk-var: #e3b341; --tk-tag: #7ee787; } }
:root[data-theme="dark"] .fileview { --tk-cm: #8b949e; --tk-str: #7ee2a8; --tk-num: #ffb86b; --tk-kw: #d2a8ff; --tk-ty: #66d9e8; --tk-fn: #79c0ff; --tk-key: #ff9492; --tk-var: #e3b341; --tk-tag: #7ee787; }
.fileview .tk-cm { color: var(--tk-cm); font-style: italic; }
.fileview .tk-str { color: var(--tk-str); }
.fileview .tk-num { color: var(--tk-num); }
.fileview .tk-kw { color: var(--tk-kw); font-weight: 600; }
.fileview .tk-ty { color: var(--tk-ty); }
.fileview .tk-fn { color: var(--tk-fn); }
.fileview .tk-key { color: var(--tk-key); }
.fileview .tk-var { color: var(--tk-var); }
.fileview .tk-tag { color: var(--tk-tag); }
`

/** A file's body alone: rendered markdown (unless `view` is `source`) or numbered source. */
export function fileBody(rel: string, text: string, view?: string): string {
  return rel.endsWith('.md') && view !== 'source'
    ? `<div class="fileview md">${renderMarkdownFile(text, rel)}</div>`
    : `<div class="fileview source">${codeView(text, rel)}</div>`
}

/**
 * The page for one served file: a markdown file rendered (or as numbered source with
 * `?view=source`), anything else as numbered source. `#L12` or `#L12-L20` highlights those lines
 * and scrolls to them; on a rendered markdown file it switches to the source view first.
 */
export function filePage(rel: string, text: string, view?: string): string {
  const md = rel.endsWith('.md')
  const rendered = md && view !== 'source'
  const title = (md && /^#\s+(.*)$/m.exec(text)?.[1]) || rel.split('/').pop()!
  const toggle = md
    ? rendered
      ? '<a href="?view=source">Source</a>'
      : '<a href="?">Rendered</a>'
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · canvas</title>
<style>
:root { --bg: #f5f5f7; --pane: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: rgba(0,0,0,.08); --line-strong: rgba(0,0,0,.14); --accent: #0a7aff; --danger: #c7282f; --code-bg: #f2f2f4; --kw: #9b2fb5; --hl: rgba(255,204,0,.22); --radius: 8px; --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1c1c1e; --pane: #242426; --fg: #f2f2f7; --muted: #98989f; --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16); --accent: #409cff; --danger: #ff6961; --code-bg: #2c2c2e; --kw: #d48cf0; --hl: rgba(255,214,10,.18); } }
:root[data-theme="dark"] { --bg: #1c1c1e; --pane: #242426; --fg: #f2f2f7; --muted: #98989f; --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16); --accent: #409cff; --danger: #ff6961; --code-bg: #2c2c2e; --kw: #d48cf0; --hl: rgba(255,214,10,.18); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.6 var(--sans); -webkit-font-smoothing: antialiased; }
.wrap { max-width: ${rendered ? '860px' : '1100px'}; margin: 0 auto; padding: 28px 16px 60px; }
.crumbs { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; font-size: 12.5px; margin-bottom: 14px; }
.crumbs a { color: var(--accent); text-decoration: none; }
.path { font: 12px var(--mono); color: var(--muted); word-break: break-all; }
article { background: var(--pane); border: 1px solid var(--line); border-radius: var(--radius); padding: ${rendered ? '20px 26px' : '8px 0'}; }
${FILE_CSS}
</style>
</head>
<body>
<div class="wrap">
  <nav class="crumbs"><a href="/">All documents</a><a href="javascript:history.back()">Back</a>${toggle}<span class="path">${escapeHtml(rel)}</span></nav>
  <article>${fileBody(rel, text, view)}</article>
</div>
<script>${WIKILINK_SCRIPT}
resolveWikilinks(document, location.pathname.startsWith('/f/') ? decodeURIComponent(location.pathname.slice(3)).replace(/[^/]*$/, '') : '');
(() => {
  const m = /^#L(\\d+)(?:-L(\\d+))?$/.exec(location.hash);
  if (!m) return;
  if (${rendered}) return location.replace('?view=source' + location.hash);
  const a = Number(m[1]), b = Number(m[2] || m[1]);
  for (let n = a; n <= b; n++) document.getElementById('L' + n)?.classList.add('hl');
  document.getElementById('L' + a)?.scrollIntoView({ block: 'center' });
})();
try { const t = localStorage.getItem('canvas:theme'); if (t && t !== 'system') document.documentElement.dataset.theme = t; } catch {}
</script>
</body>
</html>
`
}

/**
 * Defines `encPath(path)`, the client's copy of `encodePath`, and `resolveWikilinks(root, from)`:
 * asks the servlet which `[[wikilinks]]` under `root` resolve and marks the rest missing (no
 * link). `from` is the repo folder of the file holding them. Off the servlet (a static render) every wikilink is unlinked, since /resolve is not there.
 */
export const WIKILINK_SCRIPT = `
function encPath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
async function resolveWikilinks(root, from) {
  const links = [...root.querySelectorAll('a.wikilink:not([data-resolved])')];
  if (!links.length) return;
  const miss = (a) => { a.classList.add('missing'); a.removeAttribute('href'); a.title = 'no such file in this project'; };
  links.forEach((a) => a.setAttribute('data-resolved', ''));
  if (!/^https?:$/.test(location.protocol)) return links.forEach(miss);
  const names = [...new Set(links.map((a) => a.dataset.wikilink))];
  try {
    const r = await fetch('/resolve?from=' + encodeURIComponent(from || '') + '&' + names.map((n) => 'n=' + encodeURIComponent(n)).join('&'));
    const found = await r.json();
    for (const a of links) { const p = found[a.dataset.wikilink]; if (p) { a.href = '/f/' + encPath(p); a.title = p; } else miss(a); }
  } catch { links.forEach(miss); }
}`
