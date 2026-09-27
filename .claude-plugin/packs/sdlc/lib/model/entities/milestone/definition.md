---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Milestone

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Milestone is a release-shaped grouping of work with a target date
and success criteria. It is the unit by which related work is scoped,
sequenced, and shipped together. A Milestone is a *delivery vehicle*:
it gathers whatever the project needs to ship the slice — Capabilities
and Tasks today, plus references to supporting Decisions, Standards,
Principles, planning artifacts, raw notes, or any other entity the
shipping work depends on. The reference set is open; the delivery
semantics (target date, success criteria, completion) are what make
it a Milestone.

A Milestone is *not*:

- A Goal (the desired outcome the Milestone delivers; lives in the
  planned Product layer).
- A parent Task (a task with children — "epic-ness" is derived from
  `parent_key`, not a separate entity type, per [[D-ORMG-data-model]]).
  A parent Task assembles related tasks under one theme; a Milestone
  is a *delivery vehicle* with a target date and success criteria. The
  two cut different axes over the Task graph.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `M<NNNN>-<slug>.md`, or `M<NNNN>.<N>-<slug>.md` for sub-milestones (per [[D-0002-entity-identifier-shape]]) |
| Wikilink | `[[M<NNNN>-<slug>]]`, e.g. `[[M-0001-initial-entity-shape-and-roster]]`; sub-milestones use `[[M<NNNN>.<N>-<slug>]]` |
| `id` frontmatter | `M<NNNN>` (4-char base-36, minted at create; immutable; legacy sequential ids `M-0000`… are grandfathered), or `M<NNNN>.<N>` for sub-milestones inserted between top-levels (e.g. `M-0001.1`) |
| Migration | [[M-0001-initial-entity-shape-and-roster]] applies the id+slug filename shape via [[T-0002]]; existing ids are immutable. The decimal sub-milestone form is part of [[D-0002-entity-identifier-shape]] |

Order lives in the `version` field, not in the id: milestones are
product releases, so ascending `version` *is* the roadmap (per the
[[D-0002-entity-identifier-shape]]). Ids never
carry order. The separate `roadmap` manifest is retired.

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `milestone` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` | Numeric string; new entities set this |
| `id` | required | `M<NNNN>` or `M<NNNN>.<N>` |  | Immutable; matches filename prefix. Decimal form for sub-milestones inserted between top-levels |
| `title` | required | string |  | Human-readable headline |
| `status` | required | enum (see Lifecycle) | `open/draft` |  |
| `version` | conditional | semver |  | Target product release; **ascending `version` is the roadmap order**. Set once known; absent = deferred/unpositioned. Required when `status: closed/done` |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  | Last triage date |
| `target_date` | optional | ISO date |  | Aspirational; not a deadline |
| `tasks` | required (may be empty) | list of wikilinks | `[]` | Task wikilinks (including parent Tasks) |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `related` | optional | list of wikilinks | `[]` | Other milestones or tasks |
| `relevance_note` | optional | string |  | What shifted since planning |
| `completion_note` | conditional | string |  | Required for any `closed/` status |
| `need_human_review` | optional | bool | `false` | Review-tracking flag |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

The authoritative machine-readable contract is `MilestoneContract` in
`milestone/schema.ts`, validated via `sdlc entities validate`.

## Body shape

Required and optional H2 sections, in order:

| Section | Required? | Notes |
|---|---|---|
| Goal | required | One paragraph |
| Success criteria | required | 3–6 high-level bullets, each a verifiable end state |
| Deliverables | required | Everything the milestone produces. Sub-H3 categories (Decisions / Standards / Entity specs / Reviews / Implementation / Planning) encouraged. Each entry is a checkbox; typically links to a Task once one exists |
| Out of scope | optional | What the milestone explicitly does NOT cover |
| Risks / open questions | optional | Unresolved decisions or known fragility |

`order: strict`. `allow_unknown: false`. The authoritative machine-
readable contract is the `contract(...)` in `schema.ts`.

> A Milestone document is a *delivery-vehicle manifest*: what ships,
> how it's measured, what's deferred. It is **not** a place to
> elaborate implementation strategy. If a Milestone body grows `###`
> subsections of detailed bullets, that content has slipped down a
> layer and should be promoted into a Task entity (or a related
> Standard/ADR).

## Lifecycle

| Status | Meaning | Required fields |
|---|---|---|
| `open/draft` | Being defined; not committed to |  |
| `open/planned` | Committed; tasks queued; none started |  |
| `open/active` | At least one member task in progress |  |
| `closed/done` | All member tasks done; success criteria met | `version`, `completion_note` |
| `closed/partial` | Closed without full completion | `completion_note` |
| `closed/superseded` | Replaced by another milestone | `completion_note` |
| `closed/abandoned` | Decided not to pursue | `completion_note` |

Transitions are unrestricted within `open/*`; any `closed/*` state is
terminal (re-opening requires an explicit `open/*` move).

## Relationships

- **Milestone → Task** (1:N forward, via `tasks:` list). A task may
  belong to zero or one milestone; no back-link in the task schema.
  Milestone membership is derived by scanning all milestones for the
  task's wikilink.
- **Milestone ↔ Milestone** (M:N, via `related:`). Successor,
  parallel-track, depends-on-outcome relationships.
- **Milestone position** is its `version` (ascending semver), not
  `related:`, the id, or a manifest.

## Operations

| Operation | CLI | What it does |
|---|---|---|
| Create | `sdlc milestone new` | Scaffold a new instance with system-assigned id; status starts `open/draft` |
| Validate | `sdlc milestone validate <path>` (or via `project-check`) | Frontmatter + body manifest check |
| Close | `sdlc milestone close <id> --reason done|partial|superseded|abandoned` | Transition to terminal status; prompts for `completion_note` and (for `done`) `version` |
| List | `sdlc milestone list` | Roster of all milestones, optionally filtered by status |

The `Create` deterministic core is the relocated `milestone create` op
(`solutions/ontological/lib/model/entities/milestone/ops/create.ts`, Surface `runner`
— registered but not yet a CLI subcommand; T-0010); `new_milestone.ts`
and `/sdlc:milestone-new` are the shim and LLM head over it. `Validate`
is the generic `entities validate` op (`solutions/ontological/lib/model/ops/`). Per
[[D-0001-project-structure]], `solutions/ontological/scripts/` is staging-only.

## Workflow invariants

- A Milestone in `closed/done` MUST carry `version`.
- Any `closed/*` Milestone MUST carry `completion_note`.
- Two Milestones with the same `version` is a defect (`version` is
  roadmap position; duplicates make order ambiguous). `project-check`
  flags it — the ordering sibling of the duplicate-`id` invariant.
  (Check implementation is a follow-up; the invariant is normative now.)
- A Milestone with `tasks:` referencing wikilinks to non-existent
  tasks is a defect. `project-check` flags this.
- A Milestone with the same `id` as another Milestone is a defect.
  Framework hard-fails on multi-match.

## Position in the entity model

Lives in the **Work layer** of the five-layer model
([[D-ORMG-data-model]]). Working framings:

- **Parent Task vs Milestone**: a parent Task organizes related tasks
  by theme (epic-ness derived from `parent_key`; no delivery
  semantics — Epic is retired into Task self-nesting per
  [[D-ORMG-data-model]]); a Milestone is a delivery boundary (ships a
  Goal or major component with a target date and success criteria).
  The two cut different axes over the Task graph.
- **Goal vs Milestone**: Goal is the desired outcome; Milestone is
  the delivery vehicle for the outcome or a major piece of it. Both
  become first-class once the Product layer lands.

## Summary

- A release-shaped grouping of Tasks with a target date and success
  criteria; the unit by which related work is scoped and shipped
  together. ^summary
- Identifier: `M<NNNN>` sequential id, `M<NNNN>-<slug>.md` filename,
  `[[M<NNNN>-<slug>]]` wikilink. Order is the `version` field
  (ascending semver); the `roadmap` manifest is retired.
- Status enum: `open/{draft,planned,active}` and
  `closed/{done,partial,superseded,abandoned}`. `closed/*` requires
  `completion_note`; `closed/done` also requires `version`.
- Body convention: Goal / Success criteria / Deliverables / Out of
  scope / Risks. Tight, milestone-level. Detailed implementation
  belongs in member Task entities.
- Distinct from Goal (a desired outcome; future Product-layer entity)
  and from a parent Task (task-organizing via `parent_key`, no
  delivery semantics; Epic is retired into that model).
