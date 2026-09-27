---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Product

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Product is a thing this project builds and ships — the SDLC plugin
itself, an OSS library extracted from it, the harness. The project is
multi-product: each Product scopes the Drivers (and, when the type
ships, Goals) beneath it, so the why chain
([[D-7F2M-why-what-verify-chain]]) always roots in a concrete shipped
thing.

A Product is *not*:

- A Milestone (a Milestone is a release of a Product, not the product).
- The project. The project hosts several Products; each sibling earns
  its own entity when it spins out.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `PR-NNNN-<optional-slug>.md` |
| Wikilink | `[[PR-NNNN]]` or `[[PR-NNNN-<slug>]]` |
| `id` frontmatter | `PR-NNNN` (incrementing, zero-padded; immutable). `P` is taken by Principle. |
| Migration | Proto-instance `prod-1` reshaped to `PR-0001` (file `PR-0001-sdlc.md`) when the type shipped (per [[D-0002-entity-identifier-shape]]) |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `product` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `PR-NNNN` |  | Immutable; matches filename prefix |
| `status` | required | `open/draft \| open/active \| closed/sunset` | `open/draft` | See Lifecycle |
| `title` | required | string |  | Product name |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | May link narrative docs (`[[vision]]`) as well as entities |
| `tags` | required | list of strings | `[]` |  |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

Pinned framing sections, in order; the middle is free-form
(`allow_unknown: true`) so each product shapes its own exposition:

| Section | Required? | Notes |
|---|---|---|
| Summary | required | 2–4 bullets; first carries `^summary` for index transclusion |
| What it is | required | The product in a paragraph or two |
| Boundary | required | Inside vs sibling products; spin-out lines |
| Drivers & goals | optional | The Drivers scoped to this product |
| Status | optional | Where the product stands today |
| References | optional | Narrative docs and entities elaborating it |

`order: strict`. `allow_unknown: true`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning |
|---|---|
| `open/draft` | Boundary still being defined; Drivers may be provisional. |
| `open/active` | Built and operated; the steady state for a shipping product. |
| `closed/sunset` | No longer built or operated; retained for resolvability. |

Transitions:

- `open/draft → open/active` when the boundary stabilizes and the
  product ships.
- `open/active → closed/sunset` when the product is wound down or
  absorbed.

## Relationships

- **Product ← Driver**: every Driver names its Product in the Driver
  schema's product field; the Product's "Drivers & goals" section
  mirrors the inverse.
- **Product ← Milestone**: Milestones are releases of a Product
  (single-product today; a product field on Milestone is a future
  decision if multi-product milestones appear).
- **Product ↔ narrative docs**: the why lives in [[vision]]; the
  Product entity is the how, linked via `related:`.

## Operations

| Operation | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| No operations | — | — | — | Instances are authored via the generic authoring pipeline; no per-type ops yet. |

## Position in the entity model

Lives in the **Product layer** of the five-layer model
([[D-ORMG-data-model]]) — *why we're building*. The Product is the
scope anchor: Drivers root beneath it, and the SDLC layer
(Requirements, AcceptanceCriteria) elaborates the chain downward.

## Summary

- A thing this project builds and ships; scopes the Drivers and Goals
  beneath it so the why chain roots in something concrete. ^summary
- Identifier: `PR-NNNN-<optional-slug>.md` filename, incrementing
  zero-padded ids (`P` is taken by Principle).
- Lifecycle: `open/draft | open/active | closed/sunset`.
- Body: Summary / What it is / Boundary pinned; the middle is
  free-form (`allow_unknown: true`) for per-product exposition.
- `related:` may target narrative docs (`[[vision]]`), not just
  entities.
