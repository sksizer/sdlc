---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: false
---
# Term

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Term is one entry of SDLC's shared vocabulary: a named concept with
a single authoritative definition. Terms exist so the architecture
words the project leans on (substrate, harness, adapter, op, …) are
defined once, carry identity, and can be cited by stable wikilink. The
glossary (`docs/glossary.md`) is a build artifact assembled from Term
instances — never hand-edited. See
[[D-B4CA-term-entity-and-generated-glossary]].

A Term is *not*:

- A Standard. A Standard prescribes a rule; a Term names and defines a
  concept. Standards *use* Terms.
- The per-entity companion doc (`definition.md`, S-0005). That
  document specifies an entity type's contract; a Term defines one
  word of project vocabulary. The type is named `term` precisely to
  avoid colliding with that artifact.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `TM-NNNN-<slug>.md`, e.g. `TM-0001-substrate.md` |
| Wikilink | `[[TM-NNNN-<slug>]]`, piped for prose: `[[TM-0001-substrate\|substrate]]` |
| `id` frontmatter | `TM-NNNN` (incrementing, zero-padded; immutable) |
| Prefix rationale | `T` taken by Task; `G` reserved for Goal per [[D-0002-entity-identifier-shape]] |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `term` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `TM-NNNN` |  | Immutable; matches filename prefix |
| `title` | required | string |  | The term itself, canonical capitalization (`Substrate`) |
| `aliases` | optional | list of strings | `[]` | Alternate names, rendered beside the term in the glossary |
| `status` | required | enum (see Lifecycle) | `open/active` |  |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | The glossary's Source column: where the term is normative |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

| Section | Required? | Aliases | Notes |
|---|---|---|---|
| Definition | required | | One to three sentences, one paragraph; the defining paragraph carries the `^summary` block-id the glossary transcludes. Table-cell discipline: no lists, no headings |
| Contrast | optional | Not to be confused with | Disambiguation against the concept most often confused with this one |
| Notes | optional | | Elaboration that doesn't fit one table cell |
| References | optional | | Inbound and outbound links beyond the frontmatter sources |

`order: lenient`, `allow_unknown: true`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning | Glossary bucket |
|---|---|---|
| `open/active` | Adopted vocabulary, in use today. The default — a term is captured because it is in use | Active table |
| `open/draft` | Proposed vocabulary, not yet settled | Emerging table |
| `closed/retired` | No longer used; kept for link stability | Obsoleted table |

Transitions: `open/draft → open/active` when the vocabulary settles;
`open/active → closed/retired` when the concept leaves the system. A
retired Term is never deleted — inbound links must keep resolving.

## Relationships

- **Term → Decision / Standard / Principle**: `related` carries the
  sources where the term is normative; the glossary renders them as
  the Source column.
- **Term ← everything**: any artifact may cite a Term by wikilink
  (`[[TM-0001-substrate|substrate]]`); doc-level `[[glossary]]` links
  target the generated artifact instead.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | cli | `sdlc term create [<slug>] --title <term>` | `solutions/ontological/lib/model/entities/term/ops/create.ts` | Author a term with minted `TM-NNNN` identity; status defaults `open/active`; slug optional — derived from `--title` via the shared `deriveSlug` when omitted |
| preview-id | cli | `sdlc term preview-id <title>` | `solutions/ontological/lib/model/entities/term/ops/preview-id.ts` | Read-only: report the slug + `TM-NNNN` id `create` would assign for a title, plus exact/similar same-type slug collisions (writes nothing) |
| validate | cli | `sdlc entities validate <path>` | `solutions/ontological/lib/model/ops/validate.ts` | Frontmatter + body manifest check (generic cross-entity op) |
| generate | cli | `sdlc docs generate glossary` | `solutions/ontological/lib/services/docs/` | Reassemble the glossary artifact from the instances |

The generic cross-entity ops (`audit`, `migrate`, `check-identifiers`)
cover Terms with no per-type wiring.

## Workflow invariants

- A Term MUST declare `status: open/draft | open/active | closed/retired`.
- A Term's body MUST contain a Definition section whose defining
  paragraph carries the `^summary` block-id.
- The glossary artifact is generated, never hand-edited; a vocabulary
  change is an edit to a Term instance plus a regeneration.
- A retired Term keeps its file and id; deletion would break inbound
  links.

## Position in the entity model

Lives in the **Planning-meta layer** of the five-layer model
([[D-ORMG-data-model]]) — vocabulary governs how the project talks
about itself.

## Summary

- One entry of SDLC's shared vocabulary: a named concept with a single
  authoritative definition, transcluded into the generated glossary. ^summary
- Identifier: `TM-NNNN-<slug>.md` filename, `[[TM-NNNN-<slug>]]`
  wikilink, incrementing ids.
- Status enum: `open/draft | open/active | closed/retired`; default
  `open/active`.
- Body convention: Definition (required, carries `^summary`) +
  optional Contrast / Notes / References.
- Distinct from Standard (rule-bearing) and from the S-0005 companion
  `definition.md` (an entity type's contract).
