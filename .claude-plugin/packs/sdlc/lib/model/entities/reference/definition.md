---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: false
---
# Reference

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Reference is one curated external source — documentation, research,
or an artifact SDLC leans on. References exist so external material
gets identity, lifecycle, and inbound links: an optional `url` locates
it, the body summarizes or carries its substance, and the references
roster (`docs/references.md`) is a build artifact assembled from the
instances — never hand-edited. See
[[D-0009-reference-entity-and-docs-appendix]].

A Reference is *not*:

- Evidence. [[D-ORMG-data-model]]'s deferred Evidence is a per-claim
  support record — high-volume, machine-leaning. A Reference is a
  curated catalog entry; the catalog stays small and human-vetted.
- A Term. A Term defines SDLC's own vocabulary; a Reference points at
  material SDLC did not write.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `RF-NNNN-<slug>.md`, e.g. `RF-0001-obsidian-bases.md` |
| Wikilink | `[[RF-NNNN-<slug>]]`, piped for prose: `[[RF-0001-obsidian-bases\|Obsidian Bases]]` |
| `id` frontmatter | `RF-NNNN` (incrementing, zero-padded; immutable) |
| Prefix rationale | `R` reserved for Requirement per [[D-0002-entity-identifier-shape]]; `RE` mis-parses as requirement |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `reference` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `RF-NNNN` |  | Immutable; matches filename prefix |
| `title` | required | string |  | The source's name (`Obsidian Bases`) |
| `url` | optional | string, `format: uri` |  | The external location; a reference may be a book, a local artifact, or offline material |
| `status` | required | enum (see Lifecycle) | `open/active` |  |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | The roster's Cited-by column: the entities that lean on this source |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

| Section | Required? | Aliases | Notes |
|---|---|---|---|
| Summary | required | | One to three sentences, one paragraph; carries the `^summary` block-id the roster transcludes. Table-cell discipline: no lists, no headings |
| Material | optional | | The substance, in whichever form fits — a prose summary, copied excerpts (quoted, with attribution), or transcluded artifacts (`![[...]]` embeds) |
| Notes | optional | | SDLC's own commentary — how the source is applied here, caveats, version pinning |

`order: lenient`, `allow_unknown: true`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning | Roster bucket |
|---|---|---|
| `open/active` | In use — cited by current decisions/standards. The default — a reference is captured because it is leaned on | Active table |
| `open/draft` | Captured, not yet vetted or not yet load-bearing | Emerging table |
| `closed/retired` | No longer leaned on; kept for link stability | Obsoleted table |

Transitions: `open/draft → open/active` when the source becomes
load-bearing; `open/active → closed/retired` when SDLC stops leaning
on it. A retired Reference is never deleted — inbound links must keep
resolving.

## Relationships

- **Reference ← Decision / Standard / Task**: `related` carries the
  entities that lean on this source; the roster renders them as the
  Cited-by column.
- **Reference → the source**: `url` locates it when it is online;
  Material carries or summarizes it either way.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | cli | `sdlc reference create [<slug>] --title <name> [--url <url>]` | `solutions/ontological/lib/model/entities/reference/ops/create.ts` | Author a reference with minted `RF-NNNN` identity; status defaults `open/active`; slug optional — derived from `--title` via the shared `deriveSlug` when omitted |
| preview-id | cli | `sdlc reference preview-id <title>` | `solutions/ontological/lib/model/entities/reference/ops/preview-id.ts` | Read-only: report the slug + `RF-NNNN` id `create` would assign for a title, plus exact/similar same-type slug collisions (writes nothing) |
| validate | cli | `sdlc entities validate <path>` | `solutions/ontological/lib/model/ops/validate.ts` | Frontmatter + body manifest check (generic cross-entity op) |
| generate | cli | `sdlc docs generate references` | `solutions/ontological/lib/services/docs/` | Reassemble the references roster from the instances |

The generic cross-entity ops (`audit`, `migrate`, `check-identifiers`)
cover References with no per-type wiring.

## Workflow invariants

- A Reference MUST declare `status: open/draft | open/active | closed/retired`.
- A Reference's body MUST contain a Summary section whose paragraph
  carries the `^summary` block-id.
- The references roster is generated, never hand-edited; a catalog
  change is an edit to a Reference instance plus a regeneration.
- A retired Reference keeps its file and id; deletion would break
  inbound links.

## Position in the entity model

Lives in the **Planning-meta layer** of the five-layer model
([[D-ORMG-data-model]]) — the source catalog governs what the project
knows, beside the vocabulary that governs how it talks.

## Summary

- One curated external source — documentation, research, or an
  artifact SDLC leans on — with an optional `url` and a transcludable
  Summary feeding the generated references roster. ^summary
- Identifier: `RF-NNNN-<slug>.md` filename, `[[RF-NNNN-<slug>]]`
  wikilink, incrementing ids.
- Status enum: `open/draft | open/active | closed/retired`; default
  `open/active`.
- Body convention: Summary (required, carries `^summary`) + optional
  Material (summarized, copied, or transcluded substance) / Notes.
- Distinct from the deferred Evidence type (per-claim support records)
  and from Term (SDLC's own vocabulary).
