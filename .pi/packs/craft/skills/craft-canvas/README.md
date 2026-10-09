# canvas

The runtime behind `/skill:craft-canvas`: a document is a list of typed blocks, composed into one
self-contained HTML page with a fixed interaction model. Click a numbered thing on the left,
read its section in the walkthrough on the right, leave comments, answer the agent's questions.
Answers land in a JSON sidecar the agent reads back. The agent authors data; the page is never
re-authored.

```text
agent writes   docs/canvas/<id>.json          blocks: prose | annotated-text | schema | operations
       ↓
bun check.ts   docs/canvas/<id>.json          ids unique, anchors resolve, references exist
bun serve.ts                                   /d/<id>, /a/<id>, /events (watch → reload)
       ↓
reviewer       clicks, comments, chooses
       ↓
docs/canvas/<id>.answers.json                  status, comments[node], choices[question]
       ↓
agent rewrites → page reloads where it was; answers survive because node ids do
```

Runs under bun, node 23.6+ and deno, no dependencies, no build step.

| Path | What |
|---|---|
| `lib/doc.ts` | Envelope, `Question`, `Answers`, `Section`/`BlockOut`, HTML helpers |
| `lib/shell.ts` | The page: layout, tokens for both themes, the client (selection, hover, comments, choices, persistence, live reload, export) |
| `lib/compose.ts` | Blocks → page; document-level checks |
| `blocks/types.ts` | The block types |
| `blocks/<type>.ts` | One renderer and checker per type; `blocks/index.ts` is the registry |
| `check.ts`, `render.ts`, `serve.ts` | The three commands |
| `examples/sql/` | A query, a schema, a migration, and one page composing all three |

## Rules that fell out of the prototype

- Every node has a stable `id`; answers key on `(doc id, node id)`, never on position.
- Anchors are W3C Web Annotation selectors (`TextQuoteSelector` with prefix/suffix,
  `TextPositionSelector`). Agents quote fragments reliably and count characters badly.
- Code locations are LSP Locations (`uri`, zero-based `range`); the page derives the editor
  link and the GitHub permalink from them plus the document's `repo`.
- Questions carry the agent's `recommended` option, so the common case is one click.
- A comment on selected words stores a `TextQuoteSelector` beside the node id, the same
  selector shape the anchors use, and is painted with the CSS Highlight API so the DOM is
  never mutated.
- A block returns `{ left, sections }`; the shell does the rest. Adding a block type touches
  nothing else.
- The navigation carries the review's state: a comment count on every node that has one, and a
  Questions block whose dots turn from red to green as questions are answered, with a tally.
- Both side panes collapse to a rail so a plain narrative reads as one clean column. The
  contents open on hover over the left rail; the walkthrough opens when a node is clicked, and
  closes on Esc or a click on empty page. Either pane pins into the page flow, remembered per
  browser. The rails show the open-question count and the comment count.
- The centre column is its own scroller, so its bar sits between the content and the
  walkthrough; the window never scrolls.
- Status is only shown when the document asks questions, and Approved is refused until every
  question is answered. A document without questions is explanatory: comments only.
- The servlet is optional: a rendered page works from disk, from a PR, or as a hosted artifact,
  with answers kept in the browser and exported as the same JSON.

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
