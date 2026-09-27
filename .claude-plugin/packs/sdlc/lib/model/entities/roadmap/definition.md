---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Roadmap

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Roadmap is a living tracking document that groups Milestones under the
version sections they ship in (`## v0.4.0`, `## v0.5.0`, …). It answers
"what ships when, and via which milestones" at a glance, and gives
`sdlc roadmap check` a body it can validate: every milestone wikilink
resolves, every one of those milestones' own tasks resolve, no milestone
is double-booked across two versions, and no abandoned/superseded
milestone lingers unexplained.

A Roadmap is *not*:

- A Milestone (the delivery vehicle — target date, success criteria,
  member tasks). A Roadmap only references milestones by wikilink; it
  carries no delivery semantics of its own.
- The rationale/plan doc it points at via `plan_doc` (a plain planning
  doc, not an entity) — the Roadmap is the structured, checkable index
  over that doc's version sections, not the narrative itself.
- The generated `/roadmap/` site page ([[T-9LHH-site-roadmap-generated]]),
  which is a milestone-derived view assembled at site-build time and is
  unrelated to this entity type.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `RM<NNNN>.md` (id-only, no slug — same convention as Milestone) |
| Wikilink | `[[RM<NNNN>]]`, e.g. `[[RM-0001]]` |
| `id` frontmatter | `RM<NNNN>` (4-char base-36, minted at create; immutable). No sub-id suffix. |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `roadmap` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` | Numeric string; new entities set this |
| `id` | required | `RM<NNNN>` |  | Immutable; matches filename |
| `title` | required | string |  | Human-readable headline |
| `status` | required | enum (see Lifecycle) | `open/draft` |  |
| `plan_doc` | required | wikilink |  | Rationale/planning doc this roadmap tracks against (non-entity doc, e.g. `[[sdlc-0.8-plan]]`) |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  | Last triage date |
| `related` | optional | list of wikilinks | `[]` | Other entities or planning docs |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `completion_note` | conditional | string |  | Required for any `closed/` status — what superseded it, or why abandoned |
| `need_human_review` | optional | bool | `false` | Review-tracking flag |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand |

The authoritative machine-readable contract is `RoadmapContract` in
`roadmap/schema.ts`, validated via `sdlc entities validate`.

## Body shape

| Section | Required? | Notes |
|---|---|---|
| Overview | required | What this roadmap tracks, one or two paragraphs |
| `## vX.Y.Z` (repeatable) | optional, any number | Free-form H2 per tracked version; a bullet list of milestone wikilinks shipping in that version |

`order: none`, `allow_unknown: true` — the body grammar only declares
`Overview`; every other top-level H2 is accepted without being
individually enumerated (a version section, or a non-version one like
`## Pre-release`). `sdlc roadmap check` (not the contract) validates
every such top-level section's content: every milestone wikilink
resolves, every task wikilink in one of those milestones' own task
lists resolves, no milestone is linked from two different top-level
sections, and no `closed/abandoned` or `closed/superseded` milestone is
linked with no note.

## Lifecycle

| Status | Meaning | Required fields |
|---|---|---|
| `open/draft` | Being defined; not yet the working plan |  |
| `open/active` | The working roadmap; version sections are maintained |  |
| `closed/superseded` | Replaced by another roadmap | `completion_note` |
| `closed/abandoned` | Decided not to maintain | `completion_note` |

Unlike Milestone, there is deliberately no `closed/done` — a roadmap is
a living tracking document, not a shippable unit; it stays
`open/active` until replaced or dropped.

## Relationships

- **Roadmap → Milestone** (1:N, via body wikilinks under each version
  H2). Not stored in frontmatter (see the schema's design-choice note):
  the body's version sections ARE the membership list.
- **Roadmap → plan doc** (1:1, via `plan_doc`). The rationale/planning
  doc this roadmap's version structure tracks against.
- **Roadmap ↔ Roadmap** (M:N, via `related:`). A superseding roadmap
  should link back via `related` in addition to `completion_note`.

## Operations

| Operation | CLI | What it does |
|---|---|---|
| Create | `sdlc roadmap create` | Scaffold a new instance with system-assigned id; status starts `open/draft` |
| Validate | `sdlc entities validate docs/planning/roadmaps/` | Frontmatter + body contract check |
| Check | `sdlc roadmap check [<id>]` | Validate cross-references: milestone links resolve, their tasks resolve, no duplicate milestone links, no unexplained stale links. Checks every roadmap when `<id>` is omitted |

## Position in the entity model

Lives in the **Work layer** of the five-layer model
([[D-ORMG-data-model]]), one level above Milestone: a Roadmap sequences
Milestones the way a Milestone sequences Tasks, but carries no delivery
semantics of its own (no target date, no success criteria) — it is a
checkable index, not a delivery vehicle.

## Summary

- A living tracking document that groups Milestones under version
  sections (`## v0.4.0`, …); the checkable index over a plan doc's
  release structure. ^summary
- Identifier: `RM<NNNN>` base-36 id, `RM<NNNN>.md` filename (id-only,
  no slug), `[[RM<NNNN>]]` wikilink.
- Status enum: `open/{draft,active}` and `closed/{superseded,abandoned}`
  (no `closed/done` — a roadmap is never "finished", only replaced or
  dropped). `closed/*` requires `completion_note`.
- Body convention: `Overview` (required) plus any number of free-form
  `## vX.Y.Z` sections, each a bullet list of milestone wikilinks.
  `sdlc roadmap check` validates those links, not the body contract.
- Distinct from Milestone (the delivery vehicle it references) and
  from the generated `/roadmap/` site page (an unrelated milestone
  roster view).
