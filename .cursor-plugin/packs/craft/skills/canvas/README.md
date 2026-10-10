# canvas

The runtime behind `/canvas`: a document is a list of typed blocks, composed into one
self-contained HTML page with a fixed interaction model. Click a numbered thing on the left,
read its section in the walkthrough on the right, leave comments, answer the agent's questions.
Answers land in a JSON sidecar the agent reads back. The agent authors data; the page is never
re-authored.

```text
agent writes   docs/canvas/<id>.json          blocks: prose | annotated-text | schema | … | code-flow | workflow
       ↓
bun check.ts   docs/canvas/<id>.json          ids unique, anchors resolve, references exist
bun serve.ts                                   /d/<id>, /a/<id>, /events (watch → reload), /f/<path>
       ↓
reviewer       clicks, comments, chooses
       ↓
docs/canvas/<id>.answers.json                  status + verdict, comments[node], choices[question]
       ↓
agent rewrites → page reloads where it was; answers survive because node ids do
```

`/f/` serves the files git lists for the checkout (nothing outside a git checkout). A tracked file
is served whatever it holds, so a committed secret (a tracked `.env` or key) would be readable. The
servlet binds to loopback and rejects other `Host` headers; `--host 0.0.0.0` opens it to the LAN
with no auth.

Runs under bun, node 23.6+ and deno, no dependencies, no build step.

| Path | What |
|---|---|
| `lib/doc.ts` | Envelope, `Question`, `Answers`, `Section`/`BlockOut`, HTML helpers |
| `lib/shell.ts` | The page: layout, tokens for both themes, the client (selection, hover, comments, choices, persistence, live reload, export) |
| `lib/compose.ts` | Blocks → page; document-level checks |
| `lib/markdown.ts` | Blocks → markdown (headings, lists, tables, mermaid fences); the envelope and questions |
| `lib/files.ts` | The project's files: root detection, the git-listed set the servlet may serve (nothing outside a git checkout), symlink and size guards, `[[wikilink]]` resolution. The project-side module: file system and git access |
| `lib/file-view.ts` | The read-only file page at `/f/` (markdown rendered, anything else numbered), its styles and the wikilink script; pure string building |
| `lib/highlight.ts` | Syntax colouring for the code view: a small tokenizer per language family, one HTML string per line |
| `lib/diagram.ts` | Sequence diagram and flowchart as inline SVG, plus helpers for their mermaid source |
| `blocks/types.ts` | The block types |
| `blocks/<type>.ts` | One renderer, checker and markdown writer per type (prose, question, figure, annotated-text, schema, operations, matrix, trace, precedence, plan, code-flow, workflow); `blocks/index.ts` is the registry |
| `check.ts`, `render.ts`, `serve.ts` | The three commands |
| `examples/sql/` | A query, a schema, a migration, and one page composing all three |

## Rules that fell out of the prototype

- Every node has a stable `id`; answers key on `(doc id, node id)`, never on position.
- Anchors are W3C Web Annotation selectors (`TextQuoteSelector` with prefix/suffix,
  `TextPositionSelector`). Agents quote fragments reliably and count characters badly.
- Code locations are LSP Locations (`uri`, zero-based `range`); the page derives the editor
  link and the GitHub permalink from them plus the document's `repo`.
- Questions carry the agent's `recommended` option, so the common case is one click.
- A question sits where the reader meets the thing it decides. With `about` it renders under
  that node's walkthrough section; a `question` block renders it in the centre column at that
  point in the reading; only questions with neither collect at the end. The nav, the meter and
  the sidecar see one list either way.
- A comment on selected words stores a `TextQuoteSelector` beside the node id, the same
  selector shape the anchors use, and is painted with the CSS Highlight API so the DOM is
  never mutated.
- A block returns `{ left, sections }`; the shell does the rest. Adding a block type touches
  nothing else.
- The navigation carries the review's state: a comment count on every node that has one, and a
  Questions block whose dots turn from red to green as questions are answered, with a tally.
- The walkthrough is for depth, not duplication: it carries what the left does not show. A
  block whose node is fully shown on the left returns an empty section html, and the shell
  renders a compact row that exists for comments. A document of prose therefore reads as one
  column with a slim comment index on the right.
- Both side panes collapse to a rail so a plain narrative reads as one clean column. The
  contents open on hover over the left rail; the walkthrough opens when a node is clicked, and
  closes on Esc or a click on empty page. Either pane pins into the page flow, remembered per
  browser. The rails show the open-question count and the comment count.
- The centre column is its own scroller, so its bar sits between the content and the
  walkthrough; the window never scrolls.
- The verdict is given once, at the end of a round: **Finish review** opens a sheet that lists
  what is still open, takes a summary, and offers Request changes or Approve (disabled until every
  question is answered). The sidecar carries `status`, `finished` and `summary`; the agent's
  `--reopen` returns it to `reviewing` when it rewrites. A setting that could sit in any state was
  replaced by this one act, so the verdict cannot disagree with the answers.
- A comment is sent to the agent as it is added; **Save draft** keeps it private until **Send**.
  An asked-back question is sent with its own button. A sent item carries `sent`, and
  `answers.ts --wait` in the agent's session exits with it, so the agent can reply (`--reply`)
  while the review is still going. Each sent comment or ask is a thread: the agent's messages
  and the reviewer's follow-ups sit under it in order, a follow-up is sent as it is added and
  wakes the agent under the same id, and the page draws the thread as a conversation with a
  reply field at its foot. Quoted words in the centre or the walkthrough show their thread on
  hover and go to it on click.
- Every question offers "None of these, or I have a question", which keeps it open until the
  agent replies and the reviewer chooses.
- One layout at every width: rails and overlays. Under 1100px the contents pin becomes an
  overlay; under 860px the walkthrough opens full width and the rail button toggles the
  contents.
- A flow is drawn in a shape people already read: `code-flow` is a sequence diagram
  (participants, lifelines, numbered messages), `workflow` a top-down flowchart (diamonds for
  decisions, stadiums for start and end, loops on the left). Both are inline SVG from
  `lib/diagram.ts` with no library, every message or node a selectable `data-node`, and each
  carries its mermaid source under a disclosure for pasting into GitHub or a mermaid tool.
- Markdown is a second rendering of the same data, not a second document: `render.ts --out
  x.md` writes headings, lists, tables and mermaid fences from the same blocks, so a review
  can be pasted into a PR body or a README and GitHub draws the diagrams. Every block writes
  its own markdown beside its HTML.
- The header carries a question progress meter when a document asks questions: one segment
  per question, red, amber or green, each a jump to the question; the tally beside it is the
  same count the rail badge shows. Arrows beside the meter and `n`/`p` step through the questions,
  with shift for open ones only.
- The servlet is optional: a rendered page works from disk, from a PR, or as a hosted artifact,
  with answers kept in the browser and exported as the same JSON.

## How the hosting session learns of a send

The page writes the sidecar on every change, but the agent only needs to know when the reviewer
presses **Send**. Three ways were weighed:

| Way | Cost while idle | Needs | Verdict |
|---|---|---|---|
| `answers.ts --wait` as a harness background command | none; the harness wakes the session when it exits | a harness that notifies on background-command exit | the default |
| `answers.ts --notify "<cmd>"` pushing into the session | none; a process watches the folder | a way to deliver a line into the session (a host such as tmux or Orca, or a harness's native send) | for harnesses that cannot wake on exit |
| the agent polling the sidecar | a model turn per tick | nothing | never: tokens for nothing, and misses nothing a watcher would not |

A subagent that services sends was rejected: the reply needs the context of the session that wrote
the document. `--wait` exits on the first send and is re-armed after each reply; `--notify` stays
up. Both are the same watcher. `scripts/canvas-harness-live.ts` in the sdlc solution opens each
installed harness in tmux, in its headless form or the interactive session a person sits in, and
measures the round trip: from the sidecar carrying a send to the reply landing in it. Results of
2026-10-09, kept in `docs/canvas-harness-live-<mode>.json` beside the solution:

| Harness | Headless: wait started / reply after | Interactive: wait started / reply after | Answered by |
|---|---|---|---|
| claude | 5.1s / 4.5s | 6.2s / 4.5s | claude-sonnet-5-5 |
| codex | 12.3s / 3.5s | 9.3s / 8.0s | gpt-6 |
| cursor-agent | 11.3s / 5.5s | 15.8s / 7.0s | composer |
| pi | not run: no provider key on this machine | | |
| opencode | not run: crashes loading a local plugin | | |

"Wait started" is how long the harness took to read the prompt and launch the watcher; "reply
after" is what the reviewer feels. Each harness replied in both modes, so the default in the skill
holds for all three; pi and opencode are environment gaps to close, not recipe failures. gemini
was dropped from the matrix: Google retired the CLI for individuals in favour of Antigravity, an
IDE with no headless form to host a wait.

## Prior art (surveyed 2026-10-08)

Nothing found that renders agent-authored typed documents through a fixed template and collects
structured answers. Nearest, with the one idea each lends:

- Matt Pocock's skills (<https://github.com/mattpocock/skills>): `improve-codebase-architecture`
  shows an HTML report then grills you; `to-questionnaire` turns an open question into a form.
  Lends: thin skills on one interview primitive.
- Cursor Canvas (<https://cursor.com/changelog/canvas-improvements>): agent-generated panels;
  feedback as annotations and prompt buttons. Lends: fixed-reply choices.
- Plannotator (<https://github.com/backnotprop/plannotator>): a hook serves a page and returns the
  annotations as the hook result. Lends: a blocking variant, not adopted; the sidecar won
  because the reviewer and the agent keep editing the same file.
- reviewable-html-workbench (<https://github.com/u-ichi/reviewable-html-workbench>): comment
  threads as JSON the agent replies to. Lends: the sidecar shape.
- primestack-labs/plan-review (<https://github.com/primestack-labs/plan-review>): rounds with
  changed-section badges. Lends: rounds, a later addition.
