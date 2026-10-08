---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: false
---
# Note

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Note is a freeform document that fits into the ontology: strict
frontmatter (identity, `genre`, lifecycle, links) around a body with no
required sections. Plans, research write-ups, analyses, strategy docs,
retros — prose that is ours, written once, and wants identity and
inbound links instead of living as a loose file.

A Note is *not*:

- A Reference. A Reference catalogs material SDLC did not write; a Note
  is our own writing.
- A Decision. A Decision records a choice with a fixed outcome section;
  a Note may argue toward one (`genre: proposal`) but carries no verdict.
- A Backlog item or Task. Those capture work to do; a Note captures
  thinking.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `N-XXXX-<slug>.md`, e.g. `N-4F2K-sdlc-0-8-plan.md` |
| Wikilink | `[[N-XXXX-<slug>]]`, piped for prose |
| `id` frontmatter | `N-XXXX` (4 base-36 chars; immutable) |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `note` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `N-XXXX` |  | Immutable; matches filename prefix |
| `title` | required | string |  | Mirrors the body H1 |
| `state` | required | enum (see Lifecycle) | `open/draft` |  |
| `genre` | required | enum | | `plan`, `research`, `analysis`, `strategy`, `proposal`, `survey`, `retro`, `checklist` |
| `parent` | optional | note wikilink | | The hub Note this is a sub-document of |
| `superseded_by` | conditional | note wikilink | | Required when `state` is `closed/superseded` |
| `related` | optional | list of wikilinks | `[]` | Cross-references |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  |  |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `need_human_review` | optional | bool | `false` |  |

## Genres

| Genre | Document |
|---|---|
| `plan` | Sequenced intent to build something |
| `research` | Findings gathered from sources |
| `analysis` | Reasoning over data or code to reach a conclusion |
| `strategy` | Direction and trade-offs at the product level |
| `proposal` | A change put forward for a decision |
| `survey` | A broad inventory of an area |
| `retro` | A look back at what happened |
| `checklist` | Steps to tick through |

## Body shape

`# <title>` then free-form prose. `lenientBody([])`: no required
sections, unknown headings allowed. The H1 mirrors `title`.

## Hub and sub-documents

A large document set is a hub Note plus sub-documents whose `parent`
points at the hub. `parent` is a single wikilink to another Note; the
hub lists its children in prose or by `related`. Roadmaps point at
their plan through `plan_doc`, which must be a Note id.

## Lifecycle

| State | Meaning |
|---|---|
| `open/draft` | Being written. The default |
| `open/active` | Current and leaned on |
| `closed/superseded` | Replaced; `superseded_by` names the replacement |
| `closed/archived` | No longer current; kept for link stability |

A closed Note is never deleted — inbound links must keep resolving.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | cli | `sdlc note create [<slug>] --title <t> --genre <g> [--parent '[[N-XXXX]]']` | `solutions/ontological/lib/model/entities/note/noun.ts` | Author a note with minted `N-XXXX` identity; state defaults `open/draft` |
| preview-id | cli | `sdlc note preview-id <title>` | `solutions/ontological/lib/model/entities/note/noun.ts` | Read-only: report the slug + id `create` would assign, plus slug collisions |
| validate | cli | `sdlc entities validate <path>` | `solutions/ontological/lib/model/ops/validate.ts` | Frontmatter + body check (generic cross-entity op) |

The generic cross-entity ops (`audit`, `migrate`, `check-identifiers`)
cover Notes with no per-type wiring.

## Workflow invariants

- A Note MUST declare a `genre`.
- A `closed/superseded` Note MUST name `superseded_by`.
- A closed Note keeps its file and id.

## Position in the entity model

Lives in the **Planning-meta layer** ([[D-ORMG-data-model]]), beside
References and Terms.

## Summary

- A freeform document with strict frontmatter that sits in the
  ontology graph — plans, research, analyses, strategy, retros. ^summary
- Identifier: `N-XXXX-<slug>.md`, base-36 ids.
- State enum: `open/draft | open/active | closed/superseded | closed/archived`.
- Required `genre`; optional `parent` for hub/sub-document sets.
- Body is free-form; distinct from Reference, Decision, and Backlog.
