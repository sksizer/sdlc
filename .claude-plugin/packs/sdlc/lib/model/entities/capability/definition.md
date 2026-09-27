---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Capability

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Capability is a unit of functionality the system provides — an
observable ability, described independently of the code that realizes
it. Capabilities self-nest via `parent_key` to form the capability
tree: a root capability (e.g. Executable Task) decomposes into the
sub-capabilities that support it. `parent_key` is the only stored
direction; children are derived by inverting it ([[T-SJH1]]).

A Capability is *not*:

- A Task (a Task delivers or changes a capability; the Capability
  describes the standing ability).
- A Specification. Behavioral elaboration is currently collapsed into
  the Capability body; it resurrects as its own type only if a
  Capability needs multiple independent specs ([[D-ORMG-data-model]]).

## Identifier

| Concern | Shape |
|---|---|
| Filename | `C-NNNN-<optional-slug>.md` |
| Wikilink | `[[C-NNNN]]` or `[[C-NNNN-<slug>]]` |
| `id` frontmatter | `C-NNNN` (incrementing, zero-padded; immutable) |
| Migration | Proto-instances `cap-1`…`cap-10` reshaped to `C-0001`…`C-0010` when the type shipped (per [[D-0002-entity-identifier-shape]]) |

## Frontmatter

| Field | Required? | Shape | Default | Notes |
|---|---|---|---|---|
| `type` | required | `capability` |  | Validator-dispatch tag |
| `schema_version` | optional | numeric string | `"2"` |  |
| `id` | required | `C-NNNN` |  | Immutable; matches filename prefix |
| `status` | required | `open/planned \| open/building \| open/verified \| closed/retired` | `open/planned` | See Lifecycle |
| `title` | required | string |  | Human-readable name |
| `kind` | optional | 11-grain structural enum | unset | Structural grain; absent = ungraded. See Structural grains |
| `audience` | optional | `user \| system` | `system` | Index section routing. See Audience rubric |
| `created` | required | ISO date |  | First-authored date |
| `last_reviewed` | optional | ISO date |  |  |
| `parent_key` | optional | `[[C-NNNN]]` or `null` | `null` | Parent capability; null marks a tree root. The only stored tree direction — children are derived by inversion |
| `locations` | optional | list of Location strings | `[]` | Code anchors realizing the capability. See Locations grammar |
| `related` | optional | list of wikilinks | `[]` | Cross-references to other entities |
| `tags` | required | list of strings | `[]` |  |
| `need_human_review` | optional | bool | `false` |  |
| `created_at` | optional | ISO 8601 datetime |  | When the entity was authored, finer than `created` |
| `provenance` | optional | string |  | What authored it when not by hand: a skill, tool, or import source |

Schema v2 ([[T-2KK8-capability-kind-grains-and-locations]]) split the
v1 two-value `kind` (`feature | technical`) into two orthogonal axes:
structural `kind` (what kind of structure the capability names) and
`audience` (who consumes it). The v1 values were audience masquerading
as structure — `feature` mapped to `audience: user`, `technical` to
`audience: system`. Schema v2 also dropped the hand-maintained
`contains` inverse ([[T-SJH1]]).

### Structural grains

`kind` grades what KIND of structure the capability names. It says
nothing about who consumes it — a `page` can serve operators, a
`module` can serve end users through a surface above it.

| Grain | Names |
|---|---|
| `system` | A whole system boundary — the product-scale structure a tree root typically names. |
| `subsystem` | A major internal division of a system, grouping services/components toward one concern. |
| `service` | A resident or invocable unit offering functionality behind an interface (daemon, API, long-running process). |
| `workflow` | An orchestrated multi-step process — structure that exists as a sequence of steps, not a resident unit. |
| `component` | A bounded, composable building block inside a larger unit; not independently deployable. |
| `datastore` | Structure whose essence is stored state — a database, corpus, cache, or governed file tree. |
| `external` | Structure outside the project boundary the system integrates with (third-party API, host platform). |
| `module` | An importable code unit (library/package) — functionality consumed by other code, not run on its own. |
| `adapter` | A thin bridge translating between two interfaces or planes (CLI shim, protocol bridge, wrapper). |
| `generated` | An artifact a generator produces and owns — regenerated, never hand-maintained (built site, projected docs). |
| `page` | A single rendered surface unit — one page, screen, or view. |

An instance without `kind` is ungraded.

Grading rules of thumb, by what the `locations[]` anchors point at:

| Anchors point at | Lean |
|---|---|
| a tree root spread across many skills, ops and packages | `system` |
| a directory grouping several services or components toward one concern | `subsystem` |
| a daemon, server, or long-running process with an interface | `service` |
| skills, ops, or scripts run in sequence | `workflow` |
| one bounded building block inside a larger unit, not deployable alone | `component` |
| a corpus, cache, database, or governed file tree | `datastore` |
| a third-party API or host platform outside the tree | `external` |
| one importable package or library | `module` |
| a CLI shim, protocol bridge, or wrapper between two planes | `adapter` |
| a build output or projection a generator owns | `generated` |
| one page, screen, or view | `page` |

When torn between two grains, pick the one the anchors support and set
`need_human_review: true`. The anchors decide: a tree root realized as
one importable package is `module`, not `system`.

### Audience rubric

Pick `user` when the capability's direct consumer is an end user;
otherwise pick `system`. "Direct" is the test: a capability end users
only benefit from through another capability's surface is `system`.

Falsification signal — the audience is wrong when either holds:

- an `audience: user` capability whose `locations` contain no
  user-facing surface;
- an `audience: system` capability cited from user-facing docs.

Either finding means the instance is mis-audienced; fix the field or
the anchors.

### Locations grammar

`locations` entries use the five-form Location grammar shared with
task touchpoint tables (one grammar, one future overlap matcher on
`@sksizer/intersect`, [[T-U3NR]]):

| Form | Shape | Degrades to |
|---|---|---|
| file | `path/to/file.ts` | itself |
| symbol | `path/to/file.ts#symbol` | the file |
| line | `path/to/file.ts:42` | the file |
| directory | `path/to/dir/` | itself |
| glob | `solutions/ontological/lib/*.ts` | itself |

Every form degrades to a path or glob; a `#symbol` or `:line` on a
glob is rejected. `entities audit` warns (anchor rot) when a stored
location no longer resolves in the tree — existence only; symbol and
line forms degrade to the file-exists check.

## Body shape

Required and optional H2 sections, in order:

| Section | Required? | Notes |
|---|---|---|
| Summary | required | 2–4 bullets; first carries `^summary` for index transclusion |
| Statement | required | The observable ability, one or two paragraphs |
| What it provides | required | Concrete deliverables |
| Contained sub-features | optional | Tree roots — children (derived from the children's `parent_key`) |
| Lifecycle map | optional | Tree roots — how children compose |
| Inputs | optional | What the capability consumes |
| Outputs | optional | What the capability produces |
| Hook points | optional | Extension surfaces (alias: `Hook points / extension surfaces`) |
| Underlying implementation | optional | Skills / scripts / modules realizing it; `locations` carries the machine-readable anchors |
| Notes | optional | Caveats, open questions |

`order: strict`. `allow_unknown: false`. Authoritative spec is the
`contract(...)` in `schema.ts`.

## Lifecycle

| Status | Meaning |
|---|---|
| `open/planned` | Described but not yet built; the spec of an ability the system should grow. |
| `open/building` | Implementation in flight (one or more delivering Tasks in progress). |
| `open/verified` | Implemented and observed working as described. The capability tree's steady state. |
| `closed/retired` | No longer provided. Retained so older artifacts that cite it stay resolvable. |

Transitions:

- `open/planned → open/building` when a delivering Task starts.
- `open/building → open/verified` when the ability is observed working
  as described.
- `open/verified → open/building` on substantive rework.
- any `open/*` → `closed/retired` when the ability is withdrawn.

## Relationships

- **Capability ↔ Capability**: `parent_key` forms the tree. A root has
  `parent_key: null`; every child names its parent. Children are
  derived by inverting `parent_key` — no stored down-pointing list.
- **Capability ← Task**: Tasks deliver or change capabilities and cite
  them in `related:`. The authoritative direction is Task → Capability.
- **Capability ← Driver**: a Driver's "Toward resolution" names the
  capabilities that address it.
- **Capability → code**: `locations` anchors the capability to the
  files, directories, and globs realizing it.

## Operations

| Operation | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | `sdlc capability create` | `(title, fields…) → {path, id}` | `ops/create.ts` | Author a new instance through the shared create factory: slug from the title, incrementing `C-NNNN` id, curated frontmatter validated before write, body from `body-template.eta`. |
| preview-id | `sdlc capability preview-id` | `(input) → PreviewIdResult` | `ops/preview-id.ts` | Read-only: the slug and id `create` would mint, with exact and similar slug collisions. |
| update | `sdlc capability update` | `(capability, --set json) → {path, changed, wrote}` | `ops/update.ts` | Apply JSON frontmatter updates through the shared update engine; the merge must validate against the schema, the body is byte-untouched, `null` deletes a key. |
| graph | `sdlc capability graph` | `() → CapabilityGraph` | `ops/graph.ts` | The corpus as one graph: `parent_key` inverted into containment, `related` links as edges between capabilities, a ghost node per dangling `parent_key`. Also served as `GET /api/capabilities/graph` by the dashboard service and drawn by SDF's System page (`?source=capabilities`). |
| coverage | `sdlc capability coverage` | `(--scope dir\|C-NNNN) → CapabilityCoverage` | `ops/coverage.ts` | Read-only join of the corpus against the manifest walk's packages and crates: which units no capability anchors, which capabilities anchor nothing, anchor rot, and per-capability attachments (inbound wikilinks plus resolved locations). |

## Position in the entity model

Lives in the **Architecture layer** of the five-layer model
([[D-ORMG-data-model]]) — *how the system is structured*. Capabilities
describe what the system can do; Products and Drivers (Product layer)
say why it should, and Tasks (Work layer) deliver the changes.

## Summary

- A unit of functionality the system provides, self-nesting via
  `parent_key` into the capability tree (children derived by
  inversion). ^summary
- Identifier: `C-NNNN-<optional-slug>.md` filename, incrementing
  zero-padded ids.
- Two orthogonal axes: structural `kind` (11 grains, optional —
  absent = ungraded) and `audience` (`user | system`) which routes the
  instance to the matching index section.
- `locations` anchors the capability to code under the five-form
  Location grammar; `entities audit` warns on anchor rot.
- Lifecycle: `open/planned | open/building | open/verified |
  closed/retired`; `open/verified` is the steady state.
- Body: Summary / Statement / What it provides required; tree roots
  add Contained sub-features + Lifecycle map, leaves add Inputs /
  Outputs / Underlying implementation.
