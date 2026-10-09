/**
 * The page shell every kind renders into: a header, a left pane the kind
 * fills, a right pane that shows the selected node's detail, the reviewer's
 * comments on it, and the agent's questions. One inline script drives
 * selection and persistence; no framework, no build step.
 *
 * Persistence: the script PUTs answers to `/a/<doc>` when a servlet is
 * present and falls back to localStorage when it is not (a static file, an
 * artifact). "Export" downloads the same JSON either way.
 */
import type { DocMeta, Section } from './doc.ts'
import { embedJson, escapeHtml, prose, sourceLinks } from './doc.ts'

export interface Page {
  meta: DocMeta
  /** Short label under the kind eyebrow, e.g. the block types on the page. */
  kindLabel: string
  /** HTML for the left pane. */
  left: string
  /** The sections of the right pane, in order; also the j/k order. */
  nav: Section[]
  /** Titles for selectable nodes that live inside a section (e.g. columns inside a table). */
  titles?: Record<string, string>
  /** Optional links to sibling pages. */
  links?: { href: string; label: string }[]
}

/** Map every selectable node id to the section that shows it; a block maps to its first section. */
function sectionIndex(page: Page): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of page.nav) {
    out[e.id] = e.id
    if (e.blockId) out[e.blockId] ??= e.id
    for (const m of e.html.matchAll(/data-node="([^"]+)"/g)) out[m[1]] ??= e.id
  }
  return out
}

function blockTitles(page: Page): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of page.nav) if (e.blockId) out[e.blockId] ??= e.block ?? e.blockId
  return out
}

export function renderPage(page: Page): string {
  const { meta } = page
  const questions = meta.questions ?? []
  const data = {
    doc: meta.id,
    nav: page.nav,
    questions,
    nodeTitles: {
      ...page.titles,
      ...Object.fromEntries(page.nav.map((e) => [e.id, e.title])),
      ...blockTitles(page),
      [meta.id]: 'General notes',
    },
    sectionOf: { ...sectionIndex(page), [meta.id]: meta.id },
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<style>${CSS}</style>
</head>
<body>
<script>try{for(const k of ['nav','right'])if(localStorage.getItem('canvas:pin:'+k)==='1')document.body.classList.add(k+'-pinned')}catch{}</script>
<header class="top">
  <div class="top-title">
    <span class="kind">${escapeHtml(page.kindLabel)}</span>
    <h1>${escapeHtml(meta.title)}</h1>
    ${meta.summary ? `<p class="summary">${escapeHtml(meta.summary)}</p>` : ''}
  </div>
  <div class="top-tools">
    ${
      page.links?.length
        ? `<select id="docs" class="quiet" title="Other documents in this folder; this page's structure is in the contents on the left">
      <option value="">Documents…</option>${page.links.map((l) => `<option value="${escapeHtml(l.href)}">${escapeHtml(l.label)}</option>`).join('')}
    </select>`
        : ''
    }
    <div class="segmented" id="theme" role="radiogroup" aria-label="Appearance">
      <button type="button" data-theme-choice="system" aria-checked="true">System</button><button type="button" data-theme-choice="light">Light</button><button type="button" data-theme-choice="dark">Dark</button>
    </div>
    ${
      meta.repo
        ? `<select id="editor" class="quiet" title="Where source links open">
      <option value="vscode">VS Code</option>
      <option value="cursor">Cursor</option>
      <option value="zed">Zed</option>
      <option value="idea">IntelliJ</option>
      <option value="copy">Copy path</option>
    </select>`
        : ''
    }
    ${
      questions.length
        ? `<select id="status" class="quiet" title="Review status. Approved needs every question answered.">
      <option value="draft">Draft</option>
      <option value="changes-requested">Changes requested</option>
      <option value="approved">Approved</option>
    </select>`
        : ''
    }
    <button id="export" type="button" class="quiet">Export</button>
    <span id="persist" class="pill" title="Where answers are saved">…</span>
  </div>
</header>
<section id="export-box" class="export" hidden>
  <div class="pane-head"><span class="eyebrow">answers.json</span><span class="hint" id="export-note"></span></div>
  <textarea id="export-text" rows="10" readonly></textarea>
</section>
<main class="split">
  <div class="dock dock-l" id="dock-l">
    <div class="rail rail-l">
      <button type="button" class="rail-btn" data-pin="nav" title="Pin the contents open" aria-pressed="false">${ICON_SIDEBAR_L}</button>
      <span class="rail-badge rail-q" hidden title="questions still open"></span>
      <span class="rail-badge rail-c" hidden title="comments">${COMMENT_ICON}<b></b></span>
    </div>
    <nav class="pane nav" id="nav" aria-label="Contents">
      <div class="pane-head"><span class="eyebrow">Contents</span><button type="button" class="pin" data-pin="nav" title="Keep open" aria-pressed="false">${ICON_PIN}</button></div>
      ${renderNav(page.nav)}<div class="nav-block">Notes</div>${navItem(meta.id, 'General notes')}${renderQuestionNav(questions)}
    </nav>
  </div>
  <section class="pane left" id="left"><div class="left-inner">${page.left}</div></section>
  <div class="dock dock-r" id="dock-r">
    <div class="rail rail-r">
      <button type="button" class="rail-btn" data-open-right title="Open the walkthrough">${ICON_SIDEBAR_R}</button>
      <span class="rail-badge rail-q" hidden title="questions still open"></span>
      <span class="rail-badge rail-c" hidden title="comments">${COMMENT_ICON}<b></b></span>
    </div>
  <aside class="pane right" id="right">
    <div class="pane-head"><span class="eyebrow">Walkthrough</span><span class="hint" title="Click a section to highlight it. j / k step, Esc clears. Select any words to comment on them.">j k · Esc</span><span class="head-btns"><button type="button" class="pin" data-pin="right" title="Keep open" aria-pressed="false">${ICON_PIN}</button><button type="button" class="pin" data-close-right title="Close">×</button></span></div>
    ${page.nav.map((e) => sectionHtml(e.id, `${e.html}${sourceLinks(e.source, meta.repo)}`)).join('\n')}
    ${sectionHtml(meta.id, '<h2>General notes</h2><p class="muted">Anything that is not about one node.</p>', 'general')}
    ${questions.length ? `<section class="questions" id="questions"><div class="pane-head"><span class="eyebrow">Questions for you</span><span class="hint" id="q-tally"></span></div>${questions.map(renderQuestion).join('')}</section>` : ''}
  </aside>
  </div>
</main>
<div id="notice" class="notice" role="status" hidden></div>
<div id="anno" class="anno" hidden>
  <button type="button" id="anno-start"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>Comment</button>
  <form id="anno-form" hidden><div class="anno-quote" id="anno-quote"></div><textarea id="anno-text" rows="3" placeholder="About these words…"></textarea><div class="anno-row"><button type="button" id="anno-cancel" class="quiet">Cancel</button><button type="submit" class="primary">Add comment</button></div></form>
</div>
<script id="canvas-data" type="application/json">${embedJson(data)}</script>
<script>${CLIENT}</script>
</body>
</html>
`
}

const ICON_SIDEBAR_L =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M5.5 2.5v11"/></svg>'
const ICON_SIDEBAR_R =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10.5 2.5v11"/></svg>'
const ICON_PIN =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 2.5h4l-.5 4 2.5 2.5v1.5H4V9L6.5 6.5z" stroke-linejoin="round"/><path d="M8 10.5V14"/></svg>'
const COMMENT_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>'

/** One walkthrough section: the node's body, a comment button with a count, the list, and a composer. */
function sectionHtml(id: string, body: string, extraClass = ''): string {
  const i = escapeHtml(id)
  return `<section class="node ${extraClass}" data-node="${i}" id="node-${i}">
      <div class="node-actions"><button type="button" class="comment-btn" data-comment-on="${i}" title="Comment on this">${COMMENT_ICON}<span class="label">Comment</span><span class="count" hidden></span></button></div>
      <div class="node-body">${body}</div>
      <div class="comments" data-comments="${i}">
        <ul class="comment-list"></ul>
        <form class="comment-form" hidden><textarea rows="3" placeholder="Leave a note for the agent…"></textarea><div class="form-row"><button type="button" class="quiet cancel">Cancel</button><button type="submit" class="primary">Add comment</button></div></form>
      </div>
    </section>`
}

/** The left navigation: every block, then its numbered nodes. */
function renderNav(sections: Section[]): string {
  const out: string[] = []
  let block: string | undefined
  for (const sec of sections) {
    if (sec.block !== block) {
      block = sec.block
      out.push(`<div class="nav-block">${escapeHtml(block ?? '')}</div>`)
    }
    out.push(navItem(sec.id, sec.title, sec.n))
  }
  return out.join('')
}

function navItem(id: string, title: string, n?: number, extra = ''): string {
  const i = escapeHtml(id)
  return `<a class="nav-item" href="#${i}" data-node="${i}">${n != null ? `<span class="nav-n">${n}</span>` : ''}<span class="nav-title">${escapeHtml(title)}</span><span class="nav-c" data-nav-count="${i}" hidden title="comments"></span>${extra}</a>`
}

/** The questions block of the navigation: one row per question with its answered state, and a tally. */
function renderQuestionNav(questions: NonNullable<DocMeta['questions']>): string {
  if (!questions.length) return ''
  return `<div class="nav-block nav-block-q">Questions <span class="nav-tally" id="nav-tally"></span></div>${questions
    .map(
      (q) =>
        `<a class="nav-item nav-q" href="#q-${escapeHtml(q.id)}" data-nav-question="${escapeHtml(q.id)}"><span class="dot"></span><span class="nav-title">${escapeHtml(q.prompt.replace(/`/g, ''))}</span></a>`,
    )
    .join('')}`
}

function renderQuestion(
  q: DocMeta['questions'] extends (infer Q)[] | undefined ? Q : never,
): string {
  const options = q.options ?? []
  const ordered = q.recommended
    ? [...options].sort((a, b) => Number(b.id === q.recommended) - Number(a.id === q.recommended))
    : options
  const type = q.kind === 'multi' ? 'checkbox' : 'radio'
  const inputs =
    q.kind === 'text'
      ? ''
      : ordered
          .map(
            (
              o,
            ) => `<label class="opt"><input type="${type}" name="q-${escapeHtml(q.id)}" value="${escapeHtml(o.id)}" data-question="${escapeHtml(q.id)}">
      <span><span class="opt-label">${escapeHtml(o.label)}${o.id === q.recommended ? ' <em class="rec">recommended</em>' : ''}</span>${o.detail ? `<span class="opt-detail">${escapeHtml(o.detail)}</span>` : ''}</span></label>`,
          )
          .join('')
  return `<article class="question" id="q-${escapeHtml(q.id)}" data-question="${escapeHtml(q.id)}">
  <span class="state"></span><p class="prompt">${prose(q.prompt).replace(/^<p>|<\/p>$/g, '')}${q.about ? ` <a href="#" class="about" data-select="${escapeHtml(q.about)}">↗ see</a>` : ''}</p>
  ${inputs}
  <textarea rows="2" data-question-note="${escapeHtml(q.id)}" placeholder="${q.kind === 'text' ? 'Your answer' : 'Optional note'}"></textarea>
</article>`
}

const CSS = `
/* Tokens. Light first; the two dark blocks only redefine. Neutral greys lean warm in light and
   cool in dark, like macOS. */
:root {
  --bg: #f5f5f7; --pane: #ffffff; --fg: #1d1d1f; --muted: #6e6e73; --line: rgba(0,0,0,.08); --line-strong: rgba(0,0,0,.14);
  --accent: #0a7aff; --accent-soft: rgba(10,122,255,.10); --warn: #b25d00; --warn-soft: rgba(255,159,10,.16);
  --danger: #c7282f; --danger-soft: rgba(255,59,48,.12); --code-bg: #f2f2f4; --hi: rgba(255,214,10,.38); --hi-strong: rgba(255,204,0,.62);
  --ok: #1f8a3b; --ok-soft: rgba(52,199,89,.16); --kw: #7c3aed; --badge: #1d1d1f; --glass: rgba(245,245,247,.78);
  --radius: 10px; --radius-sm: 7px;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --shadow: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.08);
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #1c1c1e; --pane: #242426; --fg: #f2f2f7; --muted: #98989f; --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16);
  --accent: #409cff; --accent-soft: rgba(64,156,255,.16); --warn: #ffb340; --warn-soft: rgba(255,179,64,.16);
  --danger: #ff6961; --danger-soft: rgba(255,105,97,.16); --code-bg: #1a1a1c; --hi: rgba(255,214,10,.22); --hi-strong: rgba(255,214,10,.42);
  --ok: #30d158; --ok-soft: rgba(48,209,88,.18); --kw: #c4a4ff; --badge: #e5e5ea; --glass: rgba(28,28,30,.72); --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.45);
  color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #1c1c1e; --pane: #242426; --fg: #f2f2f7; --muted: #98989f; --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16);
  --accent: #409cff; --accent-soft: rgba(64,156,255,.16); --warn: #ffb340; --warn-soft: rgba(255,179,64,.16);
  --danger: #ff6961; --danger-soft: rgba(255,105,97,.16); --code-bg: #1a1a1c; --hi: rgba(255,214,10,.22); --hi-strong: rgba(255,214,10,.42);
  --ok: #30d158; --ok-soft: rgba(48,209,88,.18); --kw: #c4a4ff; --badge: #e5e5ea; --glass: rgba(28,28,30,.72); --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.45);
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; }
html { height: 100%; }
body { background: var(--bg); color: var(--fg); font: 14px/1.55 var(--sans); -webkit-font-smoothing: antialiased; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
h1, h2, h3, h4 { margin: 0; line-height: 1.25; letter-spacing: -.01em; }
h1 { font-size: 19px; font-weight: 600; } h2 { font-size: 15px; font-weight: 600; } h3 { font-size: 13px; font-weight: 600; }
h4 { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
p { margin: 0 0 .6em; } ul { margin: 0 0 .6em; padding-left: 1.2em; }
code { font: 12.5px var(--mono); background: var(--code-bg); padding: 1px 5px; border-radius: 5px; }
pre { margin: 0; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.muted { color: var(--muted); }
button, select, textarea { font: inherit; color: var(--fg); }
button.quiet, select.quiet, .comments button, .anno button, .top-tools button { padding: 5px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--pane); cursor: pointer; font-size: 13px; }
button.quiet:hover, .top-tools button:hover, .comments button:hover { background: var(--code-bg); }
button.primary { background: var(--accent); color: #fff; border-color: transparent; }
select.quiet { appearance: none; -webkit-appearance: none; padding-right: 22px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 12px) 55%, calc(100% - 8px) 55%; background-size: 4px 4px; background-repeat: no-repeat; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Header */
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 14px 20px 12px; border-bottom: 1px solid var(--line); background: var(--glass); backdrop-filter: saturate(180%) blur(18px); -webkit-backdrop-filter: saturate(180%) blur(18px); position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; }
.kind { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.summary { color: var(--muted); margin: 3px 0 0; max-width: 70ch; font-size: 13px; }
.top-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; font-size: 13px; }
.top-tools #docs { max-width: 220px; }
.segmented { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--code-bg); border: 1px solid var(--line); }
.segmented button { padding: 3px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; }
.segmented button[aria-checked="true"] { background: var(--pane); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.pill { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.pill.local { background: var(--warn-soft); color: var(--warn); }

/* Panes */
.split { display: grid; grid-template-columns: var(--col-l, 44px) minmax(0, 1fr) var(--col-r, 44px); gap: 0; flex: 1; min-height: 0; }
body.nav-pinned { --col-l: 230px; }
body.right-pinned, body.right-open { --col-r: minmax(360px, .9fr); }
.dock { min-height: 0; height: 100%; }
.rail { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0; width: 44px; height: 100%; }
.rail-l { border-right: 1px solid var(--line); } .rail-r { border-left: 1px solid var(--line); }
.rail-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
.rail-btn:hover { background: var(--code-bg); color: var(--fg); }
.rail-badge { display: inline-flex; align-items: center; gap: 3px; font: 600 10.5px/1 var(--sans); min-width: 22px; height: 20px; padding: 0 5px; border-radius: 999px; justify-content: center; }
.rail-c { background: var(--accent-soft); color: var(--accent); }
.rail-c svg { width: 11px; height: 11px; }
.rail-q { background: var(--danger-soft); color: var(--danger); }
.rail-q.done { background: var(--ok-soft); color: var(--ok); }
body.nav-pinned .rail-l, body.right-pinned .rail-r, body.right-open .rail-r { display: none; }
.pin { width: 24px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; }
.pin:hover { background: var(--code-bg); color: var(--fg); }
.pin[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
.head-btns { display: inline-flex; gap: 2px; margin-left: 8px; }
.nav .pane-head { margin: 0 8px 6px; }
/* Unpinned: the pane slides in beside its rail and floats over the page. */
body:not(.nav-pinned) .nav { position: fixed; top: var(--top-h, 70px); bottom: 0; height: auto; left: 44px; width: min(300px, calc(100vw - 88px)); background: var(--pane); box-shadow: var(--shadow); z-index: 4; opacity: 0; visibility: hidden; transform: translateX(-12px); transition: transform .16s ease, opacity .16s ease, visibility 0s linear .16s; }
body:not(.nav-pinned) .dock-l.hover .nav { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
body:not(.right-pinned):not(.right-open) .right { position: fixed; visibility: hidden; right: 0; top: var(--top-h, 70px); bottom: 0; width: 420px; height: auto; }
.pane { padding: 18px 20px; min-width: 0; }
.nav { border-right: 1px solid var(--line); overflow: auto; height: 100%; padding: 14px 10px; font-size: 13px; }
.nav-block { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin: 14px 8px 4px; }
.nav-block:first-child { margin-top: 2px; }
.nav-item { display: flex; gap: 8px; align-items: baseline; padding: 4px 8px; border-radius: var(--radius-sm); color: var(--fg); text-decoration: none; }
.nav-item:hover { background: var(--code-bg); text-decoration: none; }
.nav-item.on { background: var(--accent-soft); color: var(--accent); }
.nav-n { font: 600 10.5px/1 var(--sans); min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--badge); color: var(--pane); display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nav-item.on .nav-n { background: var(--accent); color: #fff; }
.nav-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.nav-c { flex: none; font: 600 10.5px/1 var(--sans); min-width: 18px; height: 16px; padding: 0 5px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); display: inline-flex; align-items: center; justify-content: center; gap: 3px; }
.nav-c::before { content: ''; width: 7px; height: 7px; border-radius: 2px 2px 2px 0; background: currentColor; }
.nav-item.on .nav-c { background: var(--accent); color: #fff; }
.nav-block-q { display: flex; align-items: center; gap: 6px; }
.nav-tally { font-weight: 500; text-transform: none; letter-spacing: 0; padding: 1px 7px; border-radius: 999px; background: var(--danger-soft); color: var(--danger); }
.nav-tally.done { background: var(--ok-soft); color: var(--ok); }
.nav-q { align-items: center; }
.nav-q .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.nav-q.answered .dot { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
.nav-q.answered .nav-title { color: var(--muted); }
.left { overflow: auto; height: 100%; }
.left-inner { max-width: 980px; margin: 0 auto; }
.right { background: var(--pane); border-left: 1px solid var(--line); overflow: auto; height: 100%; }
body.right-pinned .right .pin[data-close-right] { display: none; }
.pane-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.pane-head .hint { margin-left: auto; }
.eyebrow { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.hint { font-size: 11.5px; color: var(--muted); }
@media (max-width: 1100px) { body.nav-pinned { --col-l: 190px; } body.right-pinned { --col-r: minmax(300px, .9fr); } }
@media (max-width: 860px) { body { height: auto; display: block; overflow: auto; } .split { grid-template-columns: 1fr; } .rail, .pin { display: none; } .dock, .left, .nav, .right { height: auto; overflow: visible; } .nav, .right { position: static !important; transform: none !important; opacity: 1 !important; visibility: visible !important; width: auto !important; box-shadow: none !important; } .nav { border-right: 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 2px 8px; } .nav .pane-head, .nav-block { width: 100%; } .left { border-bottom: 1px solid var(--line); } .right { border-left: 0; } .top { position: static; } }

/* Blocks in the centre */
.block + .block { margin-top: 26px; padding-top: 22px; border-top: 1px solid var(--line); }
.block-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
.prose-block { max-width: 70ch; cursor: pointer; padding: 8px 12px; margin-left: -12px; border-radius: var(--radius-sm); border-left: 3px solid transparent; }
.prose-block:hover { background: var(--code-bg); }
.prose-block.on { border-left-color: var(--accent); background: var(--accent-soft); }

/* Annotated text */
.sql { font: 12.5px/1.65 var(--mono); background: var(--pane); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; overflow-x: auto; white-space: pre; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.sql .seg { border-radius: 3px; transition: background .12s; }
.sql .seg.peek { background: var(--hi); }
.sql .seg.on { background: var(--hi); box-shadow: 0 0 0 1.5px var(--accent); }
.sql .seg.on.inner { background: var(--hi-strong); }
.sql .kw { color: var(--kw); font-weight: 600; }
.badge { display: inline-flex; align-items: center; justify-content: center; min-width: 17px; height: 17px; padding: 0 5px; margin: 0 5px 0 0; border: 0; border-radius: 999px; background: var(--badge); color: var(--pane); font: 600 10.5px/1 var(--sans); cursor: pointer; vertical-align: text-bottom; }
.badge.on { background: var(--accent); color: #fff; outline: 2px solid var(--accent-soft); }

/* Rows: operations */
.rows { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.row { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--pane); cursor: pointer; }
.row:hover { border-color: var(--line-strong); }
.row.on { border-color: var(--accent); background: var(--accent-soft); }
.row .title { font-weight: 600; }
.row .sub { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.chips { display: inline-flex; gap: 5px; flex-wrap: wrap; }
.chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--code-bg); color: var(--muted); }
.chip.low { background: rgba(52,199,89,.14); color: #1f8a3d; }
.chip.medium { background: var(--warn-soft); color: var(--warn); }
.chip.high { background: var(--danger-soft); color: var(--danger); }

/* Schema cards */
.group { margin: 0 0 18px; }
.group h2 { margin-bottom: 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.card { padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--pane); cursor: pointer; }
.card:hover { border-color: var(--line-strong); }
.card.on { border-color: var(--accent); background: var(--accent-soft); }
.card .name { font: 600 13.5px var(--mono); }
.card .purpose { font-size: 12.5px; color: var(--muted); margin: 3px 0 6px; }
.card .meta { font-size: 11.5px; color: var(--muted); }
.rels { margin-top: 8px; font: 12.5px var(--mono); display: grid; gap: 2px; }
.rels .rel { cursor: pointer; padding: 3px 8px; border-radius: var(--radius-sm); }
.rels .rel:hover, .rels .rel.on { background: var(--accent-soft); }
.arrow { color: var(--muted); }

/* Walkthrough sections */
.node { padding: 16px 14px; margin: 0 -14px; border-top: 1px solid var(--line); border-left: 3px solid transparent; cursor: pointer; scroll-margin-top: 44px; }
.node:first-of-type { border-top: 0; }
.node.on { border-left-color: var(--accent); background: var(--accent-soft); cursor: default; }
.node.general { border-top: 1px solid var(--line); margin-top: 8px; }
.node-body h2 { margin-bottom: 4px; }
.node-body .kicker { font-size: 11.5px; color: var(--muted); margin-bottom: 8px; }
.node-body section { margin: 12px 0 0; }
.node-body table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.node-body th, .node-body td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.node-body th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
.node-body tr[data-node] { cursor: pointer; }
.node-body tr[data-node]:hover, .node-body tr[data-node].on { background: var(--accent-soft); }
.node-body .mono { font: 12.5px var(--mono); }
.node-body pre.code { font: 12px/1.5 var(--mono); background: var(--code-bg); border-radius: var(--radius-sm); padding: 10px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.diff h4 { margin-bottom: 4px; }
.warn { border-left: 3px solid var(--warn); background: var(--warn-soft); padding: 6px 10px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin: 8px 0; font-size: 12.5px; }
.dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 12.5px; }
.dl dt { color: var(--muted); } .dl dd { margin: 0; }
.xref { color: var(--accent); cursor: pointer; }
.xref:hover { text-decoration: underline; }
.node { position: relative; }
.node-actions { position: absolute; top: 14px; right: 14px; z-index: 1; }
.node-body { padding-right: 112px; }
.comment-btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--pane); color: var(--muted); font-size: 12px; font-weight: 500; cursor: pointer; }
.comment-btn:hover { color: var(--fg); border-color: var(--fg); }
.comment-btn.has { color: var(--accent); border-color: var(--accent); }
.comment-btn .count { min-width: 18px; height: 18px; padding: 0 6px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.comment-btn.open { background: var(--fg); color: var(--pane); border-color: var(--fg); }
.node .comments { margin-top: 12px; }
.node .comments:not(.has) .comment-list { display: none; }
.comment-list { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 8px; }
.comment-list li { position: relative; padding: 9px 12px 9px 14px; border-radius: var(--radius-sm); background: var(--code-bg); border-left: 3px solid var(--accent); font-size: 12.5px; }
.comment-list li .meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; font-size: 11px; color: var(--muted); }
.comment-list li .meta .who { font-weight: 600; color: var(--fg); }
.comment-list li .meta time { margin-left: 0; }
.comment-list li .meta .for { margin-left: auto; }
.comment-list li button { position: absolute; top: 7px; right: 8px; font-size: 11px; padding: 1px 7px; border-radius: 999px; }
.comment-list li .quote { display: block; font: 11.5px var(--mono); color: var(--muted); border-left: 2px solid var(--warn); padding: 1px 8px; margin: 3px 0 6px; cursor: pointer; white-space: pre-wrap; }
.comment-list li .quote.orphan { border-left-color: var(--danger); text-decoration: line-through; }
.comment-form { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--pane); }
.comment-form textarea { border: 0; padding: 2px 4px; background: transparent; }
.comment-form textarea:focus-visible { outline: none; }
.form-row { display: flex; justify-content: flex-end; gap: 6px; }
textarea { width: 100%; font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--pane); color: var(--fg); resize: vertical; }

/* Source links */
.sources { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin: 8px 0 4px; font: 11.5px var(--mono); }
.src-label { font: 600 10.5px var(--sans); color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.src-local, .src-path { color: var(--fg); text-decoration: none; border-bottom: 1px dotted var(--muted); }
.src-local:hover { color: var(--accent); border-bottom-color: var(--accent); text-decoration: none; }
.src-gh { font: 11px var(--sans); color: var(--accent); margin-left: 4px; }
.block > .sources { margin: -4px 0 10px; }

/* Export box */
.export { padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--pane); }
.export textarea { font: 12px var(--mono); }

/* Inline annotations on selected text */
::highlight(canvas-anno) { background: color-mix(in srgb, var(--warn) 26%, transparent); text-decoration: underline wavy var(--warn); }
::highlight(canvas-anno-hot) { background: color-mix(in srgb, var(--warn) 52%, transparent); }
.notice { position: fixed; z-index: 6; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 9px 14px; border-radius: 999px; background: var(--fg); color: var(--pane); font-size: 13px; box-shadow: var(--shadow); }
.anno { position: fixed; z-index: 5; background: var(--pane); border: 1px solid var(--line-strong); border-radius: 999px; box-shadow: var(--shadow); padding: 3px; font-size: 13px; }
.anno:has(#anno-form:not([hidden])) { border-radius: var(--radius); padding: 10px; max-width: 380px; }
#anno-start { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 10px; border: 0; border-radius: 999px; background: var(--fg); color: var(--pane); font-weight: 600; cursor: pointer; }
.anno-quote { font: 11.5px var(--mono); color: var(--muted); border-left: 2px solid var(--warn); padding: 2px 8px; margin: 0 0 8px; max-height: 60px; overflow: hidden; white-space: pre-wrap; }
.anno-row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
.anno textarea { width: 340px; }

/* Questions */
.questions { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.question { padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 10px; background: var(--bg); }
.question { border-left: 3px solid var(--danger); }
.question.answered { border-left-color: var(--ok); }
.question .state { display: block; font-size: 11px; font-weight: 600; color: var(--danger); margin-bottom: 4px; }
.question.answered .state { color: var(--ok); }
.question.answered .state::before, .question .state::before { content: 'Needs an answer'; }
.question.answered .state::before { content: 'Answered'; }
.question .prompt { font-weight: 600; margin-bottom: 8px; }
.question .about { font-weight: 400; font-size: 12px; margin-left: 6px; }
.opt { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; padding: 4px 0; font-size: 13px; cursor: pointer; }
.opt input { margin-top: 3px; accent-color: var(--accent); }
.opt-label { display: block; } .opt-detail { display: block; color: var(--muted); font-size: 12px; }
.rec { font-style: normal; font-size: 11px; color: var(--accent); margin-left: 4px; }
.question textarea { margin-top: 6px; }
.question.flash { box-shadow: 0 0 0 3px var(--accent-soft); }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
`

const CLIENT = `
(() => {
  const DATA = JSON.parse(document.getElementById('canvas-data').textContent);
  const KEY = 'canvas:answers:' + DATA.doc;
  const ORDER = DATA.nav.map((e) => e.id);
  let answers = { doc: DATA.doc, updated: new Date(0).toISOString(), status: 'draft', comments: [], choices: {} };
  let server = false;
  let selected = null;
  let quietUntil = 0;
  let savedAt = 0;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const right = $('#right');
  const left = $('#left');

  // ---- docks: each side pane collapses to a rail; hover peeks, a click on a node opens the
  // walkthrough, and a pin keeps a pane in the page flow. Pins are remembered per browser.
  const body = document.body;
  const topEl = $('.top');
  const setTop = () => document.documentElement.style.setProperty('--top-h', topEl.offsetHeight + 'px');
  setTop(); new ResizeObserver(setTop).observe(topEl);
  function openRight(on) { body.classList.toggle('right-open', on); }
  function setPin(k, on) {
    body.classList.toggle(k + '-pinned', on);
    try { localStorage.setItem('canvas:pin:' + k, on ? '1' : '0'); } catch {}
    $$('[data-pin="' + k + '"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
    if (k === 'right' && on) openRight(false);
  }
  ['nav', 'right'].forEach((k) => setPin(k, body.classList.contains(k + '-pinned')));
  const hoverTimers = new Map();
  for (const dock of $$('.dock-l')) {
    dock.addEventListener('mouseenter', () => { clearTimeout(hoverTimers.get(dock)); dock.classList.add('hover'); });
    dock.addEventListener('mouseleave', () => { clearTimeout(hoverTimers.get(dock)); hoverTimers.set(dock, setTimeout(() => dock.classList.remove('hover'), 220)); });
  }
  document.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) { setPin(pin.dataset.pin, !body.classList.contains(pin.dataset.pin + '-pinned')); return; }
    if (e.target.closest('[data-close-right]')) openRight(false);
    if (e.target.closest('[data-open-right]')) openRight(true);
  });

  // ---- persistence: servlet first, browser storage second
  async function load() {
    try {
      const r = await fetch('/a/' + DATA.doc, { headers: { accept: 'application/json' } });
      if (r.ok) { answers = await r.json(); server = true; }
    } catch {}
    if (!server) { try { const s = localStorage.getItem(KEY); if (s) answers = JSON.parse(s); } catch {} }
    const pill = $('#persist');
    pill.textContent = server ? 'saved to server' : 'saved in this browser';
    pill.classList.toggle('local', !server);
    if (server) listen();
  }
  // ---- live reload: the servlet announces file changes; a rewritten document reloads the
  // page (scroll kept), rewritten answers are re-read unless this page just wrote them.
  function listen() {
    let es;
    try { es = new EventSource('/events'); } catch { return; }
    es.onmessage = async (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.id !== DATA.doc) return;
      if (msg.kind === 'doc') {
        try { sessionStorage.setItem('canvas:scroll:' + DATA.doc, JSON.stringify({ right: right.scrollTop, top: left.scrollTop, open: body.classList.contains('right-open') })); } catch {}
        location.reload();
      } else if (msg.kind === 'answers' && Date.now() - savedAt > 1500) {
        try { const r = await fetch('/a/' + DATA.doc); if (r.ok) { answers = await r.json(); hydrateChoices(); renderComments(); } } catch {}
      }
    };
    es.onerror = () => { es.close(); };
  }
  function restoreScroll() {
    try {
      const s = JSON.parse(sessionStorage.getItem('canvas:scroll:' + DATA.doc) || 'null');
      sessionStorage.removeItem('canvas:scroll:' + DATA.doc);
      if (s) { right.scrollTop = s.right; left.scrollTop = s.top; openRight(!!s.open); return true; }
    } catch {}
    return false;
  }
  let timer;
  function save() {
    answers.updated = new Date().toISOString();
    savedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (server) {
        try { savedAt = Date.now(); await fetch('/a/' + DATA.doc, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) }); savedAt = Date.now(); return; } catch { server = false; }
      }
      try { localStorage.setItem(KEY, JSON.stringify(answers)); } catch {}
    }, 150);
  }

  // ---- selection: one node is current; its section and its left-pane marks light up
  function select(id, opts = {}) {
    selected = id;
    const wasOpen = body.classList.contains('right-open') || body.classList.contains('right-pinned');
    if (!id) openRight(false);
    else if (opts.from !== 'right' && opts.from !== 'none' && opts.open !== false) openRight(true);
    const section = id && DATA.sectionOf[id];
    const anchorEl = opts.from === 'right' && section ? $('#node-' + CSS.escape(section)) : null;
    const anchorTop = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
    $$('[data-node]').forEach((el) => el.classList.toggle('on', el.dataset.node === id || (el.classList.contains('node') && el.dataset.node === section)));
    $$('.sql .seg').forEach((el) => {
      const steps = (el.dataset.steps || '').split(' ').filter(Boolean);
      el.classList.toggle('on', !!id && steps.includes(id));
      el.classList.toggle('inner', !!id && steps[steps.length - 1] === id);
      el.classList.remove('peek');
    });
    if (anchorEl) { const d = anchorEl.getBoundingClientRect().top - anchorTop; if (d) right.scrollTop += d; }
    if (!id) return;
    if (opts.from === 'none') return;
    if (opts.from !== 'right') {
      const sec = $('#node-' + CSS.escape(section));
      if (sec) {
        // Scroll the pane itself; scrollIntoView would also scroll the document.
        quietUntil = Date.now() + 700;
        const top = sec.getBoundingClientRect().top - right.getBoundingClientRect().top + right.scrollTop - 8;
        // Glide when the pane was already open and the move is short; otherwise jump.
        right.scrollTo({ top, behavior: wasOpen && Math.abs(top - right.scrollTop) < 1500 ? 'smooth' : 'auto' });
      }
    }
    if (opts.from !== 'left') {
      const target = $$('#left [data-node="' + CSS.escape(id) + '"]')[0];
      if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const navItem = $('#nav [data-node="' + CSS.escape(section) + '"]');
    if (navItem) navItem.scrollIntoView({ block: 'nearest' });
    try { history.replaceState(null, '', '#' + id); } catch {}
  }
  function peek(id, on) {
    $$('.sql .seg').forEach((el) => {
      const steps = (el.dataset.steps || '').split(' ');
      if (steps.includes(id) && !el.classList.contains('on')) el.classList.toggle('peek', on);
    });
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('button[type=submit], textarea, input, select, a:not([data-select]):not(.nav-item)')) return;
    const sel = e.target.closest('[data-select]');
    if (sel) { e.preventDefault(); select(sel.dataset.select); return; }
    const node = e.target.closest('[data-node]');
    if (!node) { if (e.target.closest('#left') && !String(getSelection()).trim()) select(null); return; }
    if (node.closest('#nav')) e.preventDefault();
    const from = node.closest('#right') ? 'right' : node.closest('#nav') ? 'nav' : 'left';
    select(node.dataset.node, { from });
  });
  // Hovering a step on either side gives the SQL it explains a faint wash.
  const hoverable = (e) => e.target.closest('#left [data-node], #nav [data-node], #right .node[data-node]');
  document.addEventListener('mouseover', (e) => { const n = hoverable(e); if (n) peek(n.dataset.node, true); });
  document.addEventListener('mouseout', (e) => { const n = hoverable(e); if (n) peek(n.dataset.node, false); });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== selected && (DATA.sectionOf[id] || id === DATA.doc)) select(id); });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('textarea, input, select')) return;
    if (e.key === 'Escape') select(null);
    if (e.key === 'j' || e.key === 'k') {
      const i = ORDER.indexOf(DATA.sectionOf[selected] || selected);
      const next = e.key === 'j' ? Math.min(ORDER.length - 1, i + 1) : Math.max(0, i - 1);
      select(ORDER[next]);
    }
  });

  // ---- scroll-spy: as the walkthrough scrolls, the SQL highlight follows the top section
  let spyTimer;
  right.addEventListener('scroll', () => {
    if (Date.now() < quietUntil) return;
    clearTimeout(spyTimer);
    spyTimer = setTimeout(() => {
      const top = right.getBoundingClientRect().top + 60;
      const sections = $$('.node', right);
      let best = sections[0];
      for (const s of sections) { if (s.getBoundingClientRect().top <= top) best = s; else break; }
      if (best && DATA.sectionOf[selected] !== best.dataset.node) select(best.dataset.node, { from: 'right' });
    }, 80);
  }, { passive: true });

  // ---- comments: each section lists comments on itself and on nodes inside it
  function renderComments() {
    $$('[data-comments]').forEach((box) => {
      const sec = box.dataset.comments;
      const mine = answers.comments.filter((c) => (DATA.sectionOf[c.node] || c.node) === sec);
      box.classList.toggle('has', mine.length > 0);
      const btn = $('.comment-btn', box.closest('.node')); const count = $('.count', btn);
      btn.classList.toggle('has', mine.length > 0); count.hidden = mine.length === 0; count.textContent = String(mine.length);
      const navCount = $('[data-nav-count="' + CSS.escape(sec) + '"]'); if (navCount) { navCount.hidden = mine.length === 0; navCount.textContent = String(mine.length); }
      $('.comment-list', box).innerHTML = mine.map((c) => '<li data-comment="' + c.id + '"><div class="meta"><span class="who">' + esc(c.by || 'You') + '</span><time>' + c.at.slice(0, 16).replace('T', ' ') + '</time>' + (c.node !== sec ? '<span class="for">on ' + esc(DATA.nodeTitles[c.node] || c.node) + '</span>' : '') + '</div>' + (c.selector ? '<span class="quote' + (resolveQuote(c).length ? '' : ' orphan') + '" data-jump="' + c.id + '" title="jump to the words">“' + esc(c.selector.exact.length > 120 ? c.selector.exact.slice(0, 117) + '…' : c.selector.exact) + '”</span>' : '') + esc(c.text) + '<button type="button" data-remove="' + c.id + '" title="remove">×</button></li>').join('');
    });
    const total = answers.comments.length;
    $$('.rail-c').forEach((b) => { b.hidden = total === 0; $('b', b).textContent = String(total); });
    paintQuotes();
  }

  // ---- inline annotations: a comment on selected words, stored as a W3C TextQuoteSelector on its node
  const SUPPORTS_HL = 'highlights' in CSS && typeof Highlight === 'function';
  /**
   * The places that show a node, each as {root, pred}. A step's text inside a <pre> is several
   * segments (nested steps split it), so the whole <pre> is the root and pred keeps only the
   * segments the step covers; that way context runs across segment boundaries.
   */
  function stepScope(pre, id) {
    return { root: pre, pred: (n) => { const seg = n.parentElement.closest('.seg'); return !!seg && seg.dataset.steps.split(' ').includes(id); } };
  }
  function scopesFor(id) {
    const out = $$('[data-node="' + CSS.escape(id) + '"], [data-block="' + CSS.escape(id) + '"]').filter((el) => !el.closest('#nav')).map((root) => ({ root }));
    for (const pre of new Set($$('.seg[data-steps~="' + CSS.escape(id) + '"]').map((seg) => seg.closest('pre')))) out.push(stepScope(pre, id));
    return out;
  }
  function textNodesOf(scope) {
    const out = []; const w = document.createTreeWalker(scope.root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('textarea, .comments, .sources, .badge, script') || (scope.pred && !scope.pred(n))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  }
  function flatten(scope) {
    const nodes = textNodesOf(scope); let text = ''; const spans = [];
    for (const n of nodes) { spans.push({ node: n, start: text.length }); text += n.data; }
    return { text, spans };
  }
  function rangeFromOffsets(flat, start, end) {
    const locate = (off, isEnd) => { for (let i = flat.spans.length - 1; i >= 0; i--) { const sp = flat.spans[i]; if (off > sp.start || (off === sp.start && (!isEnd || i === 0))) return [sp.node, off - sp.start]; } return [flat.spans[0].node, 0]; };
    const r = document.createRange(); const [sn, so] = locate(start, false); const [en, eo] = locate(end, true); r.setStart(sn, so); r.setEnd(en, eo); return r;
  }
  function findInText(text, sel, strict) {
    const hits = []; let from = 0;
    for (;;) { const i = text.indexOf(sel.exact, from); if (i < 0) break; hits.push(i); from = i + 1; }
    if (!strict) return hits.slice(0, 1);
    return hits.filter((i) => (!sel.prefix || text.slice(0, i).endsWith(sel.prefix)) && (!sel.suffix || text.slice(i + sel.exact.length).startsWith(sel.suffix)));
  }
  /**
   * Every live Range for a comment's quote across the pane elements that show its node.
   * Context (prefix and suffix) must match first; only when the words moved does the bare
   * quote count, so the same phrase elsewhere on the page is not painted by mistake.
   */
  function resolveQuote(c) {
    const scopes = scopesFor(c.node).map((sc) => flatten(sc)).filter((f) => f.spans.length);
    for (const strict of [true, false]) {
      const out = [];
      for (const flat of scopes) for (const i of findInText(flat.text, c.selector, strict)) { const r = rangeFromOffsets(flat, i, i + c.selector.exact.length); if (rangeText(r) === c.selector.exact) out.push(r); }
      if (out.length) return out;
    }
    return [];
  }
  // A step's text is split around nested steps, so a match in the flattened text can straddle a
  // gap; only a range whose live DOM text (badges aside) equals the quote is painted.
  function rangeText(r) { const frag = r.cloneContents(); frag.querySelectorAll('.badge').forEach((b) => b.remove()); return frag.textContent; }
  /** The offset of a DOM point within a flattened scope; -1 when the point is in text the flattening skips. */
  function offsetIn(flat, container, offset) {
    if (container.nodeType === 3) {
      const sp = flat.spans.find((x) => x.node === container); if (sp) return sp.start + offset;
      // Inside skipped text (a badge): the first kept node after it.
      const after = flat.spans.find((x) => container.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING); return after ? after.start : flat.text.length;
    }
    const child = container.childNodes[offset];
    if (!child) return flat.text.length;
    const sp = flat.spans.find((x) => child === x.node || child.contains(x.node) || (child.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING));
    return sp ? sp.start : flat.text.length;
  }
  function paintQuotes(hot) {
    if (!SUPPORTS_HL) return;
    const all = [], hotRanges = [];
    for (const c of answers.comments) { if (!c.selector) continue; const rs = resolveQuote(c); (c.id === hot ? hotRanges : all).push(...rs); }
    CSS.highlights.set('canvas-anno', new Highlight(...all));
    CSS.highlights.set('canvas-anno-hot', new Highlight(...hotRanges));
  }
  // Where a selection lands: the innermost step under it, else the nearest node, else the block.
  function targetOf(range) {
    let el = range.commonAncestorContainer; if (el.nodeType !== 1) el = el.parentElement;
    if (!el || el.closest('#nav, textarea, input, .comments, .anno, .questions, .sources')) return null;
    const seg = el.closest('.seg[data-steps]'); if (seg) { const steps = seg.dataset.steps.split(' '); const id = steps[steps.length - 1]; return { id, scope: stepScope(seg.closest('pre'), id) }; }
    const node = el.closest('[data-node]'); if (node) return { id: node.dataset.node, scope: { root: node } };
    const block = el.closest('[data-block]'); if (block) return { id: block.dataset.block, scope: { root: block } };
    return null;
  }
  // The quote is read from the flattened text (badges and chrome excluded), between the DOM
  // points of the selection, so dragging across a step number still yields clean words.
  function selectorFor(range, scope, nodeId) {
    const flat = flatten(scope);
    let start = offsetIn(flat, range.startContainer, range.startOffset);
    let end = offsetIn(flat, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) { const t = range.toString().trim(); start = flat.text.indexOf(t); end = start + t.length; }
    if (start < 0 || end <= start) return null;
    while (start < end && /\s/.test(flat.text[start])) start++;
    while (end > start && /\s/.test(flat.text[end - 1])) end--;
    const exact = flat.text.slice(start, end);
    if (!exact) return null;
    const sel = { type: 'TextQuoteSelector', exact };
    // Context only when the words appear more than once across everything that shows this node
    // (the SQL and its explanation, say), so a unique quote stays short.
    const total = scopesFor(nodeId).reduce((n, sc) => n + flatten(sc).text.split(exact).length - 1, 0);
    if (total > 1) {
      const prefix = flat.text.slice(Math.max(0, start - 24), start), suffix = flat.text.slice(end, end + 24);
      if (prefix) sel.prefix = prefix; if (suffix) sel.suffix = suffix;
    }
    return sel;
  }
  const anno = $('#anno'); let pendingSel = null;
  function hideAnno() { anno.hidden = true; $('#anno-form').hidden = true; $('#anno-start').hidden = false; pendingSel = null; }
  document.addEventListener('selectionchange', () => {
    if (!$('#anno-form').hidden) return;
    const s = document.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) { if (pendingSel) hideAnno(); return; }
    const range = s.getRangeAt(0); const text = range.toString().trim(); if (!text) { hideAnno(); return; }
    const target = targetOf(range); if (!target) { hideAnno(); return; }
    const sel = selectorFor(range, target.scope, target.id); if (!sel) { hideAnno(); return; }
    pendingSel = { node: target.id, selector: sel, rect: range.getBoundingClientRect() };
    const r = pendingSel.rect; anno.hidden = false;
    const w = anno.offsetWidth || 110;
    anno.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    anno.style.top = Math.max(8, r.top - anno.offsetHeight - 8) + 'px';
  });
  $('#anno-start').addEventListener('mousedown', (e) => e.preventDefault());
  $('#anno-start').addEventListener('click', () => {
    if (!pendingSel) return;
    $('#anno-quote').textContent = '“' + pendingSel.selector.exact + '”';
    $('#anno-start').hidden = true; $('#anno-form').hidden = false; $('#anno-text').value = ''; $('#anno-text').focus();
  });
  $('#anno-cancel').addEventListener('click', hideAnno);
  $('#anno-form').addEventListener('submit', (e) => {
    e.preventDefault(); const text = $('#anno-text').value.trim(); if (!text || !pendingSel) return;
    answers.comments.push({ id: 'c' + Date.now().toString(36), node: pendingSel.node, selector: pendingSel.selector, text, at: new Date().toISOString() });
    const node = pendingSel.node; hideAnno(); document.getSelection()?.removeAllRanges();
    renderComments(); save(); select(node, { from: 'left' });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !anno.hidden) hideAnno(); });
  document.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]'); if (!j) return;
    e.stopPropagation();
    const c = answers.comments.find((x) => x.id === j.dataset.jump); if (!c) return;
    const rs = resolveQuote(c); if (!rs.length) return;
    paintQuotes(c.id); setTimeout(() => paintQuotes(), 1200);
    const el = rs[0].startContainer.parentElement; el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, true);
  document.addEventListener('mouseover', (e) => { const li = e.target.closest('li[data-comment]'); if (li) paintQuotes(li.dataset.comment); });
  document.addEventListener('mouseout', (e) => { const li = e.target.closest('li[data-comment]'); if (li) paintQuotes(); });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-comment-on]');
    const cancel = e.target.closest('.comment-form .cancel');
    if (!btn && !cancel) return;
    e.stopPropagation();
    const sec = (btn || cancel).closest('.node');
    const form = $('.comment-form', sec); const b = $('.comment-btn', sec);
    const open = cancel ? false : form.hidden;
    form.hidden = !open; b.classList.toggle('open', open);
    if (open) { select(sec.dataset.node, { from: 'right' }); $('textarea', form).focus(); } else $('textarea', form).value = '';
  }, true);
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('.comment-form'); if (!form) return;
    e.preventDefault();
    const box = form.closest('[data-comments]');
    const ta = $('textarea', form);
    const text = ta.value.trim(); if (!text) return;
    // Attach to the selected node when it lives in this section (a column, a step), else to the section.
    const node = selected && DATA.sectionOf[selected] === box.dataset.comments ? selected : box.dataset.comments;
    answers.comments.push({ id: 'c' + Date.now().toString(36), node, text, at: new Date().toISOString() });
    ta.value = ''; form.hidden = true; $('.comment-btn', box.closest('.node')).classList.remove('open');
    renderComments(); save();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    answers.comments = answers.comments.filter((c) => c.id !== b.dataset.remove);
    renderComments(); save();
  });

  // ---- choices
  function hydrateChoices() {
    for (const q of DATA.questions) {
      const a = answers.choices[q.id]; if (!a) continue;
      $$('input[data-question="' + CSS.escape(q.id) + '"]').forEach((i) => { i.checked = a.selected.includes(i.value); });
      const note = $('[data-question-note="' + CSS.escape(q.id) + '"]'); if (note && a.note) note.value = a.note;
      markAnswered(q.id);
    }
    const st = $('#status'); if (st) st.value = answers.status || 'draft';
    DATA.questions.forEach((q) => markAnswered(q.id));
  }
  function isAnswered(qid) { const a = answers.choices[qid]; return !!a && (a.selected.length > 0 || !!a.note); }
  function markAnswered(qid) {
    const on = isAnswered(qid);
    $('.question[data-question="' + CSS.escape(qid) + '"]').classList.toggle('answered', on);
    const nav = $('[data-nav-question="' + CSS.escape(qid) + '"]'); if (nav) nav.classList.toggle('answered', on);
    const done = DATA.questions.filter((q) => isAnswered(q.id)).length; const total = DATA.questions.length;
    const text = done + ' of ' + total + ' answered';
    const tally = $('#nav-tally'); if (tally) { tally.textContent = done === total ? 'all answered' : (total - done) + ' open'; tally.classList.toggle('done', done === total); }
    const hint = $('#q-tally'); if (hint) hint.textContent = text;
    $$('.rail-q').forEach((b) => { b.hidden = total === 0; b.textContent = done === total ? '✓' : String(total - done); b.classList.toggle('done', done === total); b.title = text; });
    const st = $('#status');
    if (st) {
      const ok = done === total;
      const approve = st.querySelector('option[value="approved"]');
      approve.disabled = !ok; approve.textContent = ok ? 'Approved' : 'Approved (' + (total - done) + ' open)';
      // A status set while questions were open is downgraded if one is re-opened.
      if (!ok && answers.status === 'approved') { answers.status = 'draft'; st.value = 'draft'; save(); notice((total - done) + ' question' + (total - done === 1 ? '' : 's') + ' still open; back to Draft'); }
    }
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav-question]'); if (!a) return;
    e.preventDefault();
    const q = $('#q-' + CSS.escape(a.dataset.navQuestion)); if (!q) return;
    right.scrollTo({ top: q.getBoundingClientRect().top - right.getBoundingClientRect().top + right.scrollTop - 8, behavior: 'smooth' });
    q.classList.add('flash'); setTimeout(() => q.classList.remove('flash'), 900);
  });
  function readChoice(qid) {
    const selectedOpts = $$('input[data-question="' + CSS.escape(qid) + '"]:checked').map((i) => i.value);
    const note = ($('[data-question-note="' + CSS.escape(qid) + '"]') || {}).value || '';
    answers.choices[qid] = { selected: selectedOpts, note: note.trim() || undefined, at: new Date().toISOString() };
    markAnswered(qid); save();
  }
  document.addEventListener('change', (e) => {
    const q = e.target.dataset.question || e.target.dataset.questionNote;
    if (q) readChoice(q);
  });
  document.addEventListener('input', (e) => { if (e.target.dataset.questionNote) readChoice(e.target.dataset.questionNote); });
  const docsSel = $('#docs');
  if (docsSel) docsSel.addEventListener('change', (e) => { if (e.target.value) location.href = e.target.value; });
  const statusSel = $('#status');
  if (statusSel) statusSel.addEventListener('change', (e) => {
    const open = DATA.questions.filter((q) => !isAnswered(q.id));
    if (e.target.value === 'approved' && open.length) {
      e.target.value = answers.status || 'draft';
      notice(open.length + ' question' + (open.length === 1 ? '' : 's') + ' still open. Answer them to approve.');
      openRight(true); const q = $('#q-' + CSS.escape(open[0].id)); if (q) { right.scrollTo({ top: q.getBoundingClientRect().top - right.getBoundingClientRect().top + right.scrollTop - 8 }); q.classList.add('flash'); setTimeout(() => q.classList.remove('flash'), 1200); }
      return;
    }
    answers.status = e.target.value; save();
  });
  let noticeTimer;
  function notice(text) {
    const n = $('#notice'); n.textContent = text; n.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 3500);
  }

  // ---- appearance: System follows the OS; Light and Dark pin the page. Stored per browser.
  const themeCtl = $('#theme');
  function applyTheme(choice) {
    if (choice === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
    $$('button', themeCtl).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice)));
  }
  try { applyTheme(localStorage.getItem('canvas:theme') || 'system'); } catch { applyTheme('system'); }
  themeCtl.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-choice]'); if (!b) return; applyTheme(b.dataset.themeChoice); try { localStorage.setItem('canvas:theme', b.dataset.themeChoice); } catch {} });

  // ---- source links: the editor scheme is a per-browser choice; "copy path" copies instead of opening
  const SCHEMES = { vscode: (p, l) => 'vscode://file/' + p + ':' + l, cursor: (p, l) => 'cursor://file/' + p + ':' + l, zed: (p, l) => 'zed://file/' + p + ':' + l, idea: (p, l) => 'idea://open?file=' + encodeURIComponent(p) + '&line=' + l };
  const editorSel = $('#editor');
  function applyEditor() {
    const scheme = editorSel ? editorSel.value : 'vscode';
    $$('.src-local').forEach((a) => { const f = SCHEMES[scheme]; a.href = f ? f(a.dataset.path, a.dataset.line) : '#'; a.title = scheme === 'copy' ? 'copy path' : 'open in editor'; });
  }
  if (editorSel) {
    try { editorSel.value = localStorage.getItem('canvas:editor') || 'vscode'; } catch {}
    editorSel.addEventListener('change', () => { try { localStorage.setItem('canvas:editor', editorSel.value); } catch {} applyEditor(); });
    applyEditor();
  }
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('.src-local'); if (!a) return;
    e.stopPropagation();
    if (!editorSel || editorSel.value !== 'copy') return;
    e.preventDefault();
    try { await navigator.clipboard.writeText(a.dataset.path + ':' + a.dataset.line); a.classList.add('copied'); setTimeout(() => a.classList.remove('copied'), 800); } catch {}
  }, true);

  // ---- export: show, copy, and try a download (some hosts block downloads)
  $('#export').addEventListener('click', async () => {
    const json = JSON.stringify(answers, null, 2);
    const box = $('#export-box'); box.hidden = !box.hidden;
    $('#export-text').value = json;
    let note = 'select and copy, or save as ' + DATA.doc + '.answers.json';
    try { await navigator.clipboard.writeText(json); note = 'copied to clipboard · ' + note; } catch {}
    $('#export-note').textContent = note;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = DATA.doc + '.answers.json'; a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  });

  function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  load().then(() => {
    hydrateChoices(); renderComments();
    const first = location.hash.slice(1);
    const restored = restoreScroll();
    quietUntil = Date.now() + 700;
    if (first) select(first, restored ? { from: 'none' } : {});
  });
})();
`
