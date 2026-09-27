# Capability rubric

One rubric for the two skills that judge capabilities: `/sdlc:capability-map` (authoring: gaps
become entities) and `/sdlc:capability-review` (verification: existing entities against the
code). Both point their sub-agents here, so a grain, audience or status decided by one skill is
the decision the other would make.

The grain table, the audience rubric, the locations grammar and the body shape live in
`lib/model/entities/capability/definition.md`. This file states how to apply them and the
decisions that file leaves open. It does not restate them.

## Grain

Anchors decide. Grade the capability by what its `locations` point at, per the "Anchors point
at" table in `definition.md`. When two grains fit, take the one the anchors support and set
`need_human_review: true`. Low confidence always sets it. A tree root realized as one package
is `module`, not `system`.

## Audience

`user` only when the capability's own `locations` include a surface an end user runs or sees
directly: a CLI binary, an app, a page, a skill a person invokes. Everything else is `system`,
including:

| Realized as | Audience |
|---|---|
| a library, engine, or component another surface mounts (a Vue component, a Nuxt layer) | `system` |
| an op, service, or scheduler consumed through a CLI or app above it | `system` |
| a CLI the person runs, an app they open, a skill they invoke | `user` |

A `user` capability whose locations name no such surface is mis-audienced; fix the field.

## Status

| Status | Holds when |
|---|---|
| `open/planned` | no realizing code; `locations` empty or planning docs only |
| `open/building` | code exists but delivers part of the Statement, or a scaffold |
| `open/verified` | the locations realize the Statement as written |
| `closed/retired` | never set by a skill; a human decision |

A shipped package with a Statement its code delivers is `open/verified` from the start.
A `planned` capability that gains realizing locations moves to `building` or `verified` by the
same test.

## Locations

- Every entry is verified on disk before it is proposed. A path the survey did not open is not
  a location.
- Symbol form (`file#symbol`) only when the symbol is found in that file. The resolver degrades a
  symbol to its file, so an invented symbol passes validation; the sub-agent is the only check.
- Directory form (`dir/`) for a whole package or crate. A file inside that directory may appear
  beside it when it is the entry point worth naming.
- Build outputs, vendored tarballs and generated glue are locations only for a `generated`
  capability.

## Tree and links

- `parent_key` names an existing capability or one created in the same plan. A child names a
  narrower ability than its parent. No product-level root above the areas.
- `related` carries cross-links that add information. It never repeats the parent, and every
  target resolves. It is the only capability-to-capability link a skill writes.

## Body

- Summary: the first bullet is the essence in one line and ends with `^summary`; one more
  bullet at most.
- Statement: the ability as observable behaviour, one or two paragraphs.
- What it provides: concrete deliverables, one per bullet.
- Underlying implementation: mirrors `locations` in prose.
- Optional sections a skill did not fill are deleted; no placeholder survives to a commit.
- Prose wraps at 100 columns.

## need_human_review

Set when grain confidence is low, when the survey disagrees with a stored grain and leaves it
in place, or when the realizing code diverges from the file's own plan (a Rust build described,
a TypeScript one shipped). It is a flag for the reader, never a reason to skip the write.

## Sub-agent verdict fields

Each skill defines its own `verdict` values. The judgement fields are shared so a verdict from
either skill reads the same:

| Field | Meaning |
|---|---|
| `kind`, `kind_confidence` | grain per the Grain section; `high` or `low` |
| `audience` | per the Audience section |
| `status` | per the Status section |
| `locations` | verified entries only |
| `related` | resolving wikilinks, parent excluded |
| `reason` | one sentence naming the evidence |

Sub-agents are read-only and return strict JSON with no surrounding prose.
