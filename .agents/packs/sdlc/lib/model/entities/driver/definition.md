---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Driver

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Driver is a motivating force behind a Product — a pain-point to
remove, a use-case to enable, or an opportunity to capture. Drivers are
the root of the why chain ([[D-7F2M-why-what-verify-chain]]): Goals
address Drivers, Requirements elaborate Goals, and AcceptanceCriteria
verify Requirements.

A Driver is *not*:

- A Goal (a Goal is the desired outcome; the Driver is the reason the
  outcome matters).
- A Task or Backlog item (those are work; a Driver explains why work
  is worth doing).

## Identifier

| Concern | Shape |
|---|---|
| Filename | `DR-NNNN-<optional-slug>.md` |
| Wikilink | `[[DR-NNNN]]` or `[[DR-NNNN-<slug>]]` |
| `id` frontmatter | `DR-NNNN` (incrementing, zero-padded; immutable). `D` is taken by Decision. |
| Migration | Proto-instances `drv-1`…`drv-10` reshaped to `DR-0001`…`DR-0010` when the type shipped (per [[D-0002-entity-identifier-shape]]) |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `driver` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `DR-NNNN` |  | Immutable; matches filename prefix |
| `status` | required | `open/proposed \| open/validated \| closed/resolved \| closed/retired` | `open/proposed` | See Lifecycle |
| `title` | required | string |  | The driver in one line |
| `kind` | required | `pain-point \| use-case \| opportunity` |  | Flavour of motivation |
| `product` | required | `[[PR-NNNN]]` wikilink |  | The Product this driver motivates |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | Cross-references to other entities |
| `tags` | required | list of strings | `[]` |  |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

Required and optional H2 sections, in order:

| Section | Required? | Notes |
|---|---|---|
| Statement | required | The driver itself; ends with `^summary` block-id (no separate Summary section) |
| Who/what it affects | required | The people and project state touched |
| Evidence | required | Cited observations; required substance for `open/validated` |
| Toward resolution | required | Capabilities / goals / milestones that address it |
| Notes | optional | Caveats, open questions |

`order: strict`. `allow_unknown: false`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning |
|---|---|
| `open/proposed` | Hypothesized; not yet backed by cited evidence. |
| `open/validated` | Backed by cited evidence; legitimately motivates Goals and work. |
| `closed/resolved` | The driver has been fully addressed; kept for the historical why chain. |
| `closed/retired` | No longer motivating work (the premise lapsed); retained for resolvability. |

Transitions:

- `open/proposed → open/validated` when Evidence carries real citations.
- `open/validated → closed/resolved` when the motivating condition is
  fully addressed.
- any `open/*` → `closed/retired` when the premise lapses.

## Relationships

- **Driver → Product**: every Driver names its Product in `product:`.
  A Product's "Drivers & goals" section mirrors the inverse.
- **Driver ← Goal**: a Goal addresses one or more Drivers (Goal is a
  planned type; until it ships, "Toward resolution" carries the
  forward pointers).
- **Driver ↔ Capability / Milestone**: cross-referenced via `related:`
  and the body's "Toward resolution".

## Operations

| Operation | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| No operations | — | — | — | Instances are authored via the generic authoring pipeline; no per-type ops yet. |

## Position in the entity model

Lives in the **Product layer** of the five-layer model
([[D-ORMG-data-model]]) — *why we're building*. Drivers root the why
chain that Goals, Requirements, and AcceptanceCriteria (SDLC layer)
elaborate downward.

## Summary

- A motivating force behind a Product — pain-point, use-case, or
  opportunity — and the root of the why chain. ^summary
- Identifier: `DR-NNNN-<optional-slug>.md` filename, incrementing
  zero-padded ids (`D` is taken by Decision).
- Required `kind` (pain-point | use-case | opportunity) and `product`
  (the `[[PR-NNNN]]` it motivates).
- Lifecycle: `open/proposed | open/validated | closed/resolved |
  closed/retired`; validation requires cited Evidence.
- Body: Statement (carries `^summary`) / Who-what it affects /
  Evidence / Toward resolution, all required.
