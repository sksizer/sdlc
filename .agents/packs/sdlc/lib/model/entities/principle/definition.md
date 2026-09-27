---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Principle

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Principle is a broad value the project leans on for design
judgment. Principles are *upstream* of Standards: a Principle says
what is valued ("prefer deterministic over LLM when possible"); a
Standard says how that value lands as a scoped rule on specific
paths.

A Principle is *not*:

- A Standard (Standards enforce; Principles guide).
- A Rule. It is a value that lets the project reason about edge
  cases — including when *not* to apply it.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `P<NNNN>-<slug>.md` |
| Wikilink | `[[P<NNNN>-<slug>]]`, e.g. `[[P-0001-prefer-deterministic-over-llm]]` |
| `id` frontmatter | `P<NNNN>` (sequential, zero-padded; immutable) |
| Migration | None planned — P-entities use sequential ids because they are catalogued, not queued |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `principle` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `P<NNNN>` |  | Immutable; matches filename prefix |
| `title` | required | string |  | One-line headline restating the principle |
| `status` | required | `open/draft \| open/published \| closed/retired` | `open/draft` | See Lifecycle |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  |  |
| `related` | optional | list of wikilinks | `[]` | Other principles or standards |
| `tags` | required | list of strings |  | MUST include exactly one `principle/<category>` |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

### Category tag

Every Principle carries exactly one `principle/<category>` tag:

| Category | Scope |
|---|---|
| `principle/product` | How the system treats its own execution as product data |
| `principle/technical` | Universal software-development values, not specific to sdlc or LLM |
| `principle/project` | Values specific to *this* sdlc project (self-hosting, harness-agnosticism) |
| `principle/llm-ai` | Values specifically about LLM and AI usage |

[[M-0000]] groups the active principles by these categories.

## Body shape

Required and optional H2 sections, in order:

| Section | Required? | Notes |
|---|---|---|
| Summary | required | First section: 3–5 tight bullets; first carries `^summary` block-id for transclusion |
| Statement | required | The principle itself, one paragraph |
| Why | required | Rationale — what failure mode this prevents, what outcome it enables |
| How it applies | required | Where the principle drives design judgment; operational shape |
| Examples | optional | Concrete instances — named files, skills, ADRs, conventions |
| Implications | required | Downstream effects; what standards it spawns; what it does NOT say |
| Notes | optional | Caveats, open questions, future evolution |

`order: strict`. `allow_unknown: false`. Authoritative spec is the
`contract(...)` in `schema.ts`. Sections may be marked `*To be expanded.*` while
`status: open/draft`.

## Lifecycle

| Status | Meaning |
|---|---|
| `open/draft` | Actively being authored or revised. Cross-references permitted but the reader should expect movement. Stub markers (`*To be expanded.*`) and `> **Draft.**` banners are permitted. |
| `open/published` | Core claim is stable for downstream artifacts (Standards, ADRs, README copy) to reference without expecting movement. Summary is canonical. Statement and Summary MUST be filled; other sections MAY still carry `*To be expanded.*` markers if the missing content elaborates rather than defines. |
| `closed/retired` | The principle no longer drives design judgment. Retained for historical reference so older artifacts that cite it stay resolvable; new artifacts should not depend on it. |

Transitions:

- `open/draft → open/published` when the principle is load-bearing enough for
  downstream artifacts to reference without expecting movement.
- `open/published → open/draft` is allowed but rare; signals substantive
  reshape.
- `open/published → closed/retired` when the principle no longer
  drives design judgment but should remain resolvable for older
  artifacts that cite it.

Supersession is a separate concern: when a Principle is replaced by
another, future fields (`superseded_by`, `supersedes`) may be added.
Not schematized today.

## Relationships

- **Principle → Standard**: a Standard cites the Principle it lands
  for via its `related:`. A Principle may list its downstream
  Standards in Implications; the authoritative direction is
  Standard → Principle.
- **Principle ↔ Principle**: principles cross-reference each other
  in `related:` and inline. Relationships are first-class but
  informal (no `depends_on` or `supersedes` today).
- **Principle ← README**: the project's README carries user-facing
  one-liners reflecting specific principles. The Principle is the
  canonical source; the README is a reflection.

## Operations

| Operation | CLI | What it does |
|---|---|---|
| Create | `sdlc principle new --category <category>` | Scaffold a new instance; status starts `open/draft` |
| Publish | `sdlc principle publish <id>` | Transition `open/draft → open/published`; checks Statement and Summary are filled |
| Validate | `sdlc principle validate <path>` | Frontmatter + body manifest check |
| List | `sdlc principle list [--category <category>]` | Roster, optionally filtered by category |
| Review | `/sdlc:principle-review [--propose]` | Skill: scan the project for contradictions, principles against each other, and prose against the descriptive-yet-succinct rubric; renders the `principle-review` report kind (`reports/review/`); `--propose` opens a PR of text edits |

`Validate` is the generic `entities validate` op
(`solutions/ontological/lib/model/ops/`, Surface `runner` — registered, not yet a CLI
subcommand; T-0010). Principle has no per-type `create` op yet; the
other generic cross-entity ops (`audit`, `migrate`, `check-identifiers`)
also live under `solutions/ontological/lib/model/ops/`.

## Workflow invariants

- A Principle MUST declare `status: open/draft`, `status: open/published`, or
  `status: closed/retired`.
- A Principle MUST carry exactly one `principle/<category>` tag.
- An `open/published` Principle's Statement and Summary MUST be filled.
  Other sections MAY carry `*To be expanded.*` markers if the
  missing content is elaboration rather than definition.
- A Principle's first Summary bullet MUST carry `^summary` so
  index-level transclusions work.

## Position in the entity model

Lives in the **Planning-meta layer** of the five-layer model
([[D-ORMG-data-model]]). Planning-meta is sdlc-specific: it covers
the artifacts that govern how the project reasons about itself, not
the artifacts that describe what is being built.

## Summary

- A broad value the project leans on for design judgment; upstream of
  Standards (Principles guide, Standards enforce). ^summary
- Identifier: `P<NNNN>-<slug>.md` filename, `[[P<NNNN>-<slug>]]`
  wikilink, sequential zero-padded ids.
- Required category tag: one of
  `principle/{product,technical,project,llm-ai}`. [[M-0000]] groups the
  active set by category.
- Body sections: Statement / Why / How it applies / Examples /
  Implications / Notes / Summary. First Summary bullet carries
  `^summary`.
- Lifecycle: `open/draft | open/published | closed/retired`. `open/published` requires Statement +
  Summary filled.
