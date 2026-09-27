# Task implementation-ready contract

What it means for a task document to be "implementation-ready":
concrete enough that a competent implementer can begin work without
further design conversation.

This document describes the state. It does not prescribe how any
particular skill makes a document reach that state — that lives in
the skills themselves.

## Applicability

This contract binds LEAF tasks — tasks no other task names in
`parent_key`. A task with children is an organizational rollup (an
epic, derived from `parent_key`, not a separate type — see
[[D-ORMG-data-model]]): it is not a dispatchable work order, and the
sections and disqualifiers below are category errors for it (a
rollup has no Areas). A parent is EXEMPT — its readiness is
its children's readiness. Readiness gates skip rollups instead of
failing them: no gap evaluation, no `readiness_verified_at` stamp,
no status downshift. The same leaf-only rule governs dispatch
([[D-VSLI-distributed-work-runner-architecture]]); this is the
readiness half of that split ([[D-S30G-task-state-plane-split]]).

Parenthood is a deterministic fact, not a judgment call.
`sdlc task gap-report` inverts `parent_key` across the task corpus
and reports `parenthood: { is_parent, children }`, with
`parent=<bool>` as the last token of its one-line marker. A gate
reads that fact first. Parenthood is structural, not
status-dependent: a parent whose every child is closed is still a
parent.

A rollup is well-formed when its body states the rollup criteria —
what "done" means across the children — and the children carry the
`parent_key` pointers that derive the containment.

## Body sections

The floor is universal: it is what holds for every task kind, which
makes it the loosest contract of them all. Depth belongs to the routed
process — per-kind contracts re-tighten these sections once the
process registry owns them
([[D-VSLI-distributed-work-runner-architecture]]). Until then a
section below is either required of every task, or optional in
presence but fully typed whenever it appears.

### Required of every task

- **Goal / problem statement** — one or two sentences. Not a title;
  an actual description of what's wrong or what's wanted.
- **Acceptance criteria** — `- [ ] AC-N: ...` checklist. Each AC
  must be objectively verifiable (assertable, observable,
  demonstrable). "Code is cleaner" is not an AC; "no call site of
  `foo()` remains outside `bar.rs`" is.
- **Out of scope** — always required. Enumerate the obvious
  near-misses the task is deliberately not addressing. When the
  surrounding scope is genuinely obvious and there is nothing to
  exclude, write a single `- none` bullet — the explicit `- none`
  signals "scope considered, nothing excluded" rather than "scope
  not considered."

### Optional in presence, typed when present

Absence is not a gap. A present section still has to satisfy its
shape, so nothing below is a place to put a half-filled table.

- **Today / current state** — free-form prose describing the relevant
  area today (or what's wrong/missing there). No required shape, no
  path-existence check: this section is narrative context for the
  implementer, not a machine-verified inventory. Write it however
  best orients a reader — a paragraph, a short list, a table if that
  reads best — none of it is resolved against the codebase.
- **Approach** (or **Plan**) — concrete steps a competent engineer
  could execute without further design. Not "investigate X" — that's
  a research task, not an implementation plan.
- **Areas** — the packages, directories, or modules this task expects
  to touch. **Advisory, not a resolution gate**: an area does not have
  to name an exact existing file, and the verifier never disqualifies
  a task because a cited area doesn't resolve on disk — this section
  orients an implementer (and helps concurrent-work tooling notice two
  tasks converging on the same region), it does not enumerate exact
  edits. When written as a table, use two columns:

  | Area | Note |
  |---|---|
  | `solutions/ontological/lib/services/foo/` | Where the new validation lives |
  | `solutions/ontological/plugin/plugins/sdlc/skills/task-define/` | Prose/consumer updates |

  `Area` names a package, directory, or module (a trailing slash on a
  directory is conventional but not required); `Note` is a one-line
  gloss on why that area is in play. Prose or a bulleted list is
  equally acceptable — pick whichever communicates the region best;
  there is no bulleted-fallback rejection the way the old
  Files-to-touch table had. This section replaces the old, stricter
  `## Files to touch` (a table of exact file paths with a
  new/modify/delete `Kind` and a mandatory reference-enumeration rule
  for deletes) — that per-file bookkeeping is now the implementer's
  business during the change itself, not something the spec has to
  get right up front.

## Required frontmatter

- `status` is one of the active pre-implementation stages —
  `planning/draft`, `planning/proposed`, `planning/backlog`,
  `open/ready` — OR an active mid-implementation stage —
  `in-progress`, `in-progress/blocked`. NOT
  `planning/needs-definition` and NOT any `closed/*` value.

  The `in-progress*` carve-out exists so that re-running the readiness
  check against an already-started task (e.g. when `/sdlc:task-work`'s
  Step 5 fires a second time in a resumed session) is a safe no-op
  when the stamp is still fresh, instead of clobbering valid
  in-flight state.
- `impact` is set.
- `complexity` is set.
- `created` is set.

## Disqualifiers

A doc is NOT implementation-ready if any of these hold, even when
every required section is technically present:

- ACs are subjective ("feels better", "is clean", "is correct").
- The Approach defers a real design decision to "the implementer".
- `<...>` placeholder text from the new-task template remains in
  the body of any required section.
- Unresolved spec-drift placeholders survive in the body of a required
  section. The detected phrases are `TBD` (whole word,
  case-insensitive), `(final name ...)` parentheticals,
  `(or final ...)` parentheticals, `(pick one)`, and any
  non-backticked `<...>` angle-bracket placeholder. Phrases inside
  fenced code blocks (` ``` ` / ` ~~~ `) and inline-code spans
  (`` ` ``) are not flagged — only literal placeholders left in
  prose where a real value should have replaced them. This rule
  lets a task discuss placeholder phrases as subject matter (in a
  post-mortem, in inline code) without tripping the gate, while
  still catching the spec-drift case where a `(final name TBD)`
  survives from authoring into pickup.
- The Approach (or Proposed) assumes a single uniform corpus shape while the corpus it operates on
  is mid-migration — i.e. different instances carry different shapes — without specifying the
  strictness/tolerance split the implementer would otherwise have to invent on the spot (the
  recurring shape: a `discover()` that must absorb a pre-migration corpus shape alongside the
  post-migration one). **This is an LLM-judged disqualifier, not a purely mechanical one** — like
  the subjective-AC entry above, whether an assumption is *wrong* is a semantic call (the corpus may
  legitimately be uniform). The mechanical scanner
  `sdlc task scan-corpus-assumptions`
  (`solutions/ontological/lib/model/entities/task/ops/scan-corpus-assumptions.ts`)
  only surfaces *candidates* (uniform-corpus phrasing in `## Approach` / `## Proposed` with no
  nearby tolerance/strictness signal); the LLM evaluation in `/sdlc:task-ensure-ready` Step 3
  confirms or clears each candidate before it becomes a gap.

### Pluggable claim-resolver disqualifiers

Beyond the structural disqualifiers above (which the placeholder
scanner enforces), a growing family of *claim* checks —
each verifying that a specific kind of citation in the spec still holds
against reality — is implemented as a pluggable resolver registry rather
than as inline prose here. The canonical list lives in code at
`solutions/ontological/lib/model/entities/task/claims/`: one small module per claim kind, each
satisfying the `ClaimResolver` interface in
`solutions/ontological/lib/model/entities/task/claims/types.ts` and registered explicitly in
`solutions/ontological/lib/model/entities/task/claims/index.ts`. The
`/sdlc:task-ensure-ready` gate runs them all via the
`sdlc task check-claims` op (`solutions/ontological/lib/model/entities/task/ops/check-claims.ts`)
and treats every `severity: "disqualifier"` finding as a fail reason.

Adding a new claim disqualifier is a one-file change — a new resolver
module plus one registry line — not a new bullet here. The resolvers'
own module docstrings are the authoritative contract for what each kind
checks. The registry today:

- `paths` — a back-ticked, path-shaped citation whose cited path no
  longer exists but whose basename uniquely matches a file elsewhere in
  the tree (the file moved; the citation should be updated).
- `quantifiers` — an acceptance criterion that asserts over a universal
  class (`every` / `each` / `all` / `sibling`) without pinning the set
  (no inline enumeration, no back-ticked command/glob, no enumeration
  pointer) — i.e. an unverifiable vacuous universal.

## Verification state

A task that satisfies this contract has `readiness_verified_at:`
set in its frontmatter to an ISO 8601 UTC datetime — the moment at
which the contract was last verified to hold.

A task that does not satisfy this contract has
`readiness_verified_at:` unset. It may additionally carry
`definition_gap:` (a description of what's missing) and
`status: planning/needs-definition`.

### Fail-mode carve-out for `in-progress*`

When the input task was already `in-progress` or `in-progress/blocked`,
a failed readiness check still records the `definition_gap` and still
clears `readiness_verified_at:`, but it does NOT downshift `status:`
to `planning/needs-definition`. The task is already mid-flight;
downshifting away from `in-progress` corrupts task-work state
(worktree, branch, and PR all assume the doc reflects an active
implementation). The gap surfaces via `definition_gap:` and the
cleared stamp — that is enough signal for downstream callers to stop
without rewriting the lifecycle position.

Recency of `readiness_verified_at:` is a caller concern. The field
records when the contract was last checked; different callers may
require different freshness windows before trusting the stamp.
