---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: false
---
# Decision

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Decision (also called ADR — Architecture Decision Record) captures
a project-level design choice: the context that prompted it, the
options weighed, and the resolution. Decisions are the durable
record of *why this and not that*; their continued relevance is
checked when downstream work bumps against them.

A Decision is *not*:

- A Standard. A Standard prescribes a rule on specific paths. A
  Decision records the reasoning behind a choice; Standards are one
  possible *output* of a Decision.
- A Principle. A Principle is a broad value; a Decision is a scoped
  resolution. Decisions often cite Principles in their rationale.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `D<NNNN>-<slug>.md` for single-file decisions; `D<NNNN>-<slug>/README.md` for folder-shaped decisions (when supporting documents like sub-options or supplementary analysis ship alongside) |
| Wikilink | `[[D<NNNN>-<slug>]]`, e.g. `[[D-0002-entity-identifier-shape]]` |
| `id` frontmatter | `D<NNNN>` (4-char base-36, minted at create; immutable; legacy sequential ids `D-0001`… are grandfathered) |
| Migration | Existing ADRs at `docs/planning/decisions/<slug>.md` and `docs/planning/decisions/<slug>/` get ids and the `<slug>.md` → `D<NNNN>-<slug>.md` rename in [[M-0001-initial-entity-shape-and-roster]] via [[T-0002]] |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `decision` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"1"` |  |
| `id` | required | `D<NNNN>` |  | Immutable; matches filename prefix |
| `title` | required | string |  | Human-readable headline |
| `status` | required | enum (see Lifecycle) | `open/proposed` |  |
| `created` | required | ISO date |  |  |
| `last_reviewed` | optional | ISO date |  | When the decision was last sanity-checked |
| `supersedes` | optional | wikilink to a Decision |  | Legacy — no longer written; supersession deletes the predecessor and the deletion commit records the succession |
| `superseded_by` | conditional | wikilink to a Decision |  | Required when `status: closed/superseded` (legacy tombstones only — new supersessions delete the predecessor) |
| `related` | optional | list of wikilinks | `[]` | Other decisions, principles, standards, or milestones |
| `tags` | optional | list of strings | `[]` | Free-form labels |
| `deprecation_note` | conditional | string |  | Required when `status: closed/deprecated` |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

## Body shape

| Section | Required? | Aliases | Notes |
|---|---|---|---|
| Summary | required | | Bulleted outcomes at the **top** of the doc, each linking down to the section that elaborates it. Carries `^summary` block-id for transclusion. Placeholder allowed until `status: open/accepted` |
| Decision | required | Recommendation, Conclusion, Resolution | What was decided. Exactly one form must appear |
| Status | optional | | Narrative status; authoritative status is the frontmatter `status:` field |
| Context | optional | What this is, Background | Situation that prompted the decision |
| Why | optional | Rationale | Why this and not a plausible alternative |
| Options considered | optional | | Alternatives weighed before landing on the decision |
| Consequences | optional | Implications | What becomes easier, what binds future work |
| Migration | optional | | How current state moves to the decided state |
| Out of scope | optional | | What this decision explicitly does NOT cover |
| Open questions | optional | | Unresolved sub-decisions |
| Notes | optional | | Caveats, references to discussions |
| References | optional | | Inbound and outbound links |

`order: lenient` (sections may appear in any order — Decisions vary
by shape). `allow_unknown: true` (authors may add custom sections
when the standard set doesn't cover). Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning | Required fields |
|---|---|---|
| `open/proposed` | Authored; under review. Not yet binding. Summary section may carry the "*Pending — outcomes to be populated when this decision is accepted.*" placeholder |  |
| `open/accepted` | Reviewed and adopted. Downstream work conforms. Summary section MUST be populated with bulleted outcomes, each linking down to the section it elaborates | populated `Summary` |
| `closed/superseded` | Legacy tombstone — no longer minted; a fully superseded Decision is deleted instead | `superseded_by` |
| `closed/deprecated` | The decision no longer applies; not replaced by a successor | `deprecation_note` |

Transitions:

- `open/proposed → open/accepted` when the decision is endorsed.
- `open/accepted → deleted` when a new Decision lands that fully replaces it:
  the predecessor file is deleted in the same change, inbound wikilinks
  re-pointed at the successor, the deletion commit naming it. Git history is
  the archive — no tombstone, no lineage frontmatter. A Decision only
  partially absorbed is amended in place and stays `open/accepted`.
- `open/accepted → closed/deprecated` when the decision stops applying for
  reasons other than replacement (e.g., the problem it solved no
  longer exists).
- Reversing a supersession or re-opening a `closed/deprecated` Decision creates
  a NEW Decision (recover prose from git history); terminal states stay
  terminal.

## Relationships

- **Decision → Principle**: a Decision may cite Principles in its
  rationale (`related:` or inline). Principles shape Decisions; the
  inverse is informal.
- **Decision → Standard**: a Standard may emerge from a Decision (the
  Standard's `related:` cites the Decision).
- **Decision ↔ Decision** (M:N, via `related:`, `supersedes:`,
  `superseded_by:`). Forms a directed graph of replacements over
  time.
- **Decision ← Milestone**: a Milestone's deliverables may include
  authoring a Decision; the Milestone's `related:` cites it.

## Operations

| Operation | CLI | What it does |
|---|---|---|
| Create | `sdlc decision new` | Scaffold a new instance; status starts `open/proposed` |
| Accept | `sdlc decision accept <id>` | Transition `open/proposed → open/accepted` |
| Supersede | `sdlc decision supersede <old-id> --by <new-id>` | Delete the predecessor; the deletion commit names the successor. (Implementation still tombstones; slated to match this contract) |
| Deprecate | `sdlc decision deprecate <id> --reason <note>` | Set to `closed/deprecated` with `deprecation_note:` |
| Validate | `sdlc decision validate <path>` | Frontmatter + body manifest check |
| List | `sdlc decision list [--status <status>]` | Roster |

`Validate` is the generic `entities validate` op
(`solutions/ontological/lib/model/ops/`, Surface `runner` — registered, not yet a CLI
subcommand; T-0010). Decision has no per-type `create` op yet; the other
generic cross-entity ops (`audit`, `migrate`, `check-identifiers`) also
live under `solutions/ontological/lib/model/ops/`.

## Workflow invariants

- A Decision MUST declare
  `status: open/proposed | open/accepted | closed/superseded | closed/deprecated`.
- A `closed/superseded` Decision MUST carry `superseded_by:` pointing at a
  Decision.
- A `closed/deprecated` Decision MUST carry `deprecation_note:`.
- A Decision's body MUST contain a Summary-section at the top and
  a Decision-section (under that name or one of its aliases).
- A Decision with `status: open/accepted` MUST carry a populated Summary
  (not the placeholder).
- `superseded_by:` MUST point at a Decision that exists. `supersedes:` is
  legacy — new supersessions write no pointer; the deletion commit records
  the lineage.

## Position in the entity model

Lives in the **Planning-meta layer** of the five-layer model
([[D-ORMG-data-model]]). Planning-meta covers artifacts that govern
how the project reasons about itself.

## Summary

- A project-level design choice with context, options considered,
  and rationale; the durable record of *why this and not that*. ^summary
- Identifier: `D<NNNN>-<slug>.md` filename (or folder for complex
  decisions), `[[D<NNNN>-<slug>]]` wikilink, sequential zero-padded
  ids.
- Status enum: `open/proposed | open/accepted | closed/superseded | closed/deprecated`.
  `closed/superseded` requires `superseded_by:` and is legacy — a fully
  superseded Decision is deleted, git history is the archive;
  `closed/deprecated` requires `deprecation_note:`.
- Body convention: Decision (required, under that name or an alias)
  - flexible optional sections (Status / Context / Why / Options
  considered / Consequences / Migration / Open questions / Notes /
  References).
- Distinct from Standard (rule-bearing) and Principle (value-
  bearing). Decisions often spawn Standards and cite Principles.
