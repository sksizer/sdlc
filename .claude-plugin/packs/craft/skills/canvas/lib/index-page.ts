/** The servlet's front page: every document in the folder as a card with its kinds, verdict and progress. Same tokens as the page shell. */
import { escapeHtml } from './doc.ts'

export interface IndexEntry {
  id: string
  title: string
  summary?: string | undefined
  kinds: string[]
  status: string
  questions: number
  answered: number
  comments: number
  updated?: string | undefined
  created: string
}

const STATUS: Record<string, [string, string]> = {
  reviewing: ['Reviewing', 'st-reviewing'],
  'changes-requested': ['Changes requested', 'st-changes'],
  approved: ['Approved', 'st-approved'],
}

export function indexPage(dir: string, entries: IndexEntry[]): string {
  const rows = entries
    .sort((a, b) => (b.updated ?? b.created).localeCompare(a.updated ?? a.created))
    .map((e) => {
      const [label, cls] = STATUS[e.status] ?? [e.status, 'st-reviewing']
      const explanatory = e.questions === 0
      const progress = explanatory
        ? '<span class="chip">explanatory</span>'
        : `<span class="chip ${e.answered === e.questions ? 'q-done' : 'q-open'}">${e.answered} / ${e.questions} answered</span>`
      return `<a class="card" href="/d/${escapeHtml(e.id)}">
  <div class="card-head"><h2>${escapeHtml(e.title)}</h2>${explanatory ? '' : `<span class="chip ${cls}">${label}</span>`}</div>
  ${e.summary ? `<p>${escapeHtml(e.summary)}</p>` : ''}
  <div class="meta">${e.kinds.map((k) => `<span class="kind">${escapeHtml(k)}</span>`).join('')}<span class="spacer"></span>${progress}${e.comments ? `<span class="chip">${e.comments} comment${e.comments === 1 ? '' : 's'}</span>` : ''}<span class="when">${escapeHtml((e.updated ?? e.created).slice(0, 16).replace('T', ' '))}</span></div>
</a>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documents · canvas</title>
<style>
:root { --bg: #f5f5f7; --pane: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: rgba(0,0,0,.08); --line-strong: rgba(0,0,0,.14); --accent: #0a7aff; --accent-soft: rgba(10,122,255,.10); --warn: #b25d00; --warn-soft: rgba(255,159,10,.16); --danger: #c7282f; --danger-soft: rgba(255,59,48,.12); --ok: #1f8a3b; --ok-soft: rgba(52,199,89,.16); --code-bg: #f2f2f4; --radius: 8px; --sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1c1e; --pane: #242426; --fg: #f2f2f7; --muted: #98989f; --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16); --accent: #409cff; --accent-soft: rgba(64,156,255,.16); --warn: #ffb340; --warn-soft: rgba(255,179,64,.16); --danger: #ff6961; --danger-soft: rgba(255,105,97,.16); --ok: #30d158; --ok-soft: rgba(48,209,88,.16); --code-bg: #2c2c2e; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 880px; margin: 0 auto; padding: 36px 20px 60px; }
.kind-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
h1 { font-size: 20px; margin: 2px 0 4px; letter-spacing: -.01em; }
.folder { font: 12px var(--mono); color: var(--muted); margin: 0 0 22px; word-break: break-all; }
.cards { display: grid; gap: 10px; }
.card { display: block; padding: 14px 16px; background: var(--pane); border: 1px solid var(--line); border-radius: var(--radius); color: inherit; text-decoration: none; }
.card:hover { border-color: var(--line-strong); }
.card-head { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; }
.card h2 { font-size: 15px; margin: 0; }
.card p { margin: 4px 0 0; color: var(--muted); max-width: 78ch; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
.kind { font: 11px var(--mono); color: var(--muted); padding: 1px 6px; border: 1px solid var(--line-strong); border-radius: 4px; }
.spacer { flex: 1; }
.chip { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--code-bg); color: var(--muted); white-space: nowrap; }
.chip.st-reviewing { background: var(--accent-soft); color: var(--accent); }
.chip.st-changes { background: var(--warn-soft); color: var(--warn); }
.chip.st-approved { background: var(--ok-soft); color: var(--ok); }
.chip.q-open { background: var(--danger-soft); color: var(--danger); }
.chip.q-done { background: var(--ok-soft); color: var(--ok); }
.when { font: 11px var(--mono); color: var(--muted); margin-left: 4px; }
.empty { color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <div class="kind-eyebrow">Canvas</div>
  <h1>Documents</h1>
  <p class="folder">${escapeHtml(dir)}</p>
  <div class="cards">${rows || '<p class="empty">No documents in this folder yet.</p>'}</div>
</div>
</body>
</html>
`
}
