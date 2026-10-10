/**
 * The envelope every canvas document shares, plus the answer sidecar that
 * reviewers write and agents read back.
 *
 * A canvas document is a typed data structure an agent generates: a list of
 * blocks, each of a small reusable type (`blocks/types.ts`), composed into one
 * self-contained HTML page. Every node that a reviewer might comment on
 * carries a stable `id`; comments and choices are keyed by document id and
 * node id, never by position, so an agent can regenerate the page and the
 * answers still attach.
 */

/**
 * Where a thing lives in code: an LSP Location. `uri` is a path relative to
 * the repository root, or a `file://` URI; `range` is zero-based line and
 * character, end exclusive, as in the Language Server Protocol.
 */
export interface Position {
  line: number
  character: number
}

export interface Source {
  uri: string
  range?: { start: Position; end: Position }
}

/** Any addressable thing on the page. */
export interface Node {
  id: string
  /** Where this thing lives in code; rendered as a local link and a GitHub permalink. */
  source?: Source | Source[]
}

/** The repository the document's sources point into. */
export interface Repo {
  /** e.g. https://github.com/owner/name */
  remote: string
  /** The commit the sources were read at; permalinks pin to it. */
  commit: string
  /** Absolute path of the checkout, for local editor links. */
  root?: string
}

/** One option in a choice question. */
export interface Option extends Node {
  label: string
  /** Why one would pick this; trade-offs. */
  detail?: string
}

/** A decision the agent needs from the reviewer. */
export interface Question extends Node {
  prompt: string
  kind: 'single' | 'multi' | 'text'
  options?: Option[]
  /** Option id the agent recommends, shown first and marked. */
  recommended?: string
  /** Node id this question is about; selecting the question selects the node. */
  about?: string
}

export interface DocMeta {
  /** Stable slug; also the file stem and the answers key. */
  id: string
  title: string
  summary?: string
  /** ISO date. */
  created: string
  author?: { agent?: string; session?: string }
  repo?: Repo
  questions?: Question[]
}

/** What a block renders to. The page stacks lefts and sections in block order. */
export interface Section {
  id: string
  /** Display number within its block; omit for unnumbered sections. */
  n?: number
  title: string
  summary?: string
  /** The walkthrough body for this node. */
  html: string
  /** The block this section belongs to; compose fills it in for the navigation. */
  block?: string
  /** Where the node lives in code, shown under the section heading. */
  source?: Source | Source[] | undefined
  /** The block id; compose fills it in so a selection inside a block can attach to it. */
  blockId?: string
}

export interface BlockOut {
  /** HTML for the left pane. */
  left: string
  sections: Section[]
  /** Titles for selectable nodes inside a section, e.g. columns inside a table. */
  titles?: Record<string, string>
}

/** One reviewer comment on a node, or on a span of text inside it. */
export interface Comment {
  id: string
  node: string
  text: string
  at: string
  by?: string
  resolved?: boolean
  /** When set, the comment is on these exact words within the node (a W3C TextQuoteSelector). */
  selector?: { type: 'TextQuoteSelector'; exact: string; prefix?: string; suffix?: string }
  /** When the reviewer sent it to the agent; unsent comments are still being written. */
  sent?: string
  /** The conversation under it, in order: the agent's answers and the reviewer's follow-ups. */
  replies?: Message[]
}

/**
 * One message in the thread under a comment or an asked-back question. The agent appends with
 * `answers.ts --reply`; the reviewer's follow-up is sent as it is added. The thread is awaiting the
 * agent while its last reviewer message has no agent message after it.
 */
export interface Message {
  from: 'agent' | 'reviewer'
  text: string
  at: string
  /** Reviewer messages: when it went to the agent. */
  sent?: string
  /** Agent messages: what the agent did about it. */
  action?: 'answered' | 'changed' | 'declined' | undefined
  /** Agent messages: the model and the harness it ran in. Shown on hover. */
  by?: { model?: string | undefined; harness?: string | undefined } | undefined
}

/** The reviewer's answer to one question. */
export interface Choice {
  selected: string[]
  note?: string
  at: string
  /**
   * The reviewer asked back instead of choosing: what is missing, or what they need to know.
   * The question stays open until the agent replies and the reviewer chooses.
   */
  ask?: string
  sent?: string
  replies?: Message[]
}

/**
 * The sidecar `<doc>.answers.json`. The page writes it (through the servlet or
 * a download); an agent reads it to continue. Keyed by node ids, so it
 * survives a regenerated page.
 */
export interface Answers {
  doc: string
  updated: string
  /**
   * `reviewing` until the reviewer finishes the round; then the verdict. `approved` requires
   * every question answered; the page enforces it. The agent's `--reopen` returns it to
   * `reviewing` when it rewrites the document.
   */
  status: 'reviewing' | 'changes-requested' | 'approved'
  /** When the verdict was given. Absent while reviewing. */
  finished?: string
  /** The reviewer's closing note, given with the verdict. */
  summary?: string
  comments: Comment[]
  choices: Record<string, Choice>
}

export function emptyAnswers(doc: string): Answers {
  return { doc, updated: new Date(0).toISOString(), status: 'reviewing', comments: [], choices: {} }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Plain text with two inline marks: `code` in backticks and **strong**.
 * Paragraphs split on blank lines; a line starting with "- " is a bullet.
 */
export function prose(text: string | undefined): string {
  if (!text) return ''
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((l) => l.startsWith('- '))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`
      }
      return `<p>${inline(lines.join(' '))}</p>`
    })
    .join('')
}

/** Resolve a source URI to a repo-relative path and an absolute local path, where possible. */
export function sourcePaths(
  src: Source,
  repo?: Repo,
): { rel?: string | undefined; abs?: string | undefined } {
  let p = src.uri
  if (p.startsWith('file://')) p = decodeURIComponent(p.slice('file://'.length))
  if (p.startsWith('/')) {
    const root = repo?.root?.replace(/\/$/, '')
    return { abs: p, rel: root && p.startsWith(root + '/') ? p.slice(root.length + 1) : undefined }
  }
  return { rel: p, abs: repo?.root ? `${repo.root.replace(/\/$/, '')}/${p}` : undefined }
}

/** The links for one node's sources: a local editor link (scheme chosen on the page) and a GitHub permalink. */
export function sourceLinks(source: Source | Source[] | undefined, repo?: Repo): string {
  if (!source) return ''
  const list = Array.isArray(source) ? source : [source]
  const items = list.map((src) => {
    const { rel, abs } = sourcePaths(src, repo)
    const l1 = src.range ? src.range.start.line + 1 : undefined
    const l2 = src.range
      ? Math.max(
          src.range.start.line + 1,
          src.range.end.line + (src.range.end.character > 0 ? 1 : 0),
        )
      : undefined
    const label = `${escapeHtml(rel ?? abs ?? src.uri)}${l1 ? `:${l1}${l2 && l2 !== l1 ? `-${l2}` : ''}` : ''}`
    const local = abs
      ? `<a class="src-local" data-path="${escapeHtml(abs)}" data-line="${l1 ?? 1}" href="#">${label}</a>`
      : `<span class="src-path">${label}</span>`
    const gh =
      repo && rel && /^https:\/\/github\.com\//.test(repo.remote)
        ? ` <a class="src-gh" href="${escapeHtml(`${repo.remote.replace(/\/$/, '')}/blob/${repo.commit}/${rel}`)}${l1 ? `#L${l1}${l2 && l2 !== l1 ? `-L${l2}` : ''}` : ''}" target="_blank" rel="noopener">GitHub</a>`
        : ''
    return `<span class="src">${local}${gh}</span>`
  })
  return `<div class="sources"><span class="src-label">Source</span>${items.join('')}</div>`
}

/** JSON safe to embed inside a <script> element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
