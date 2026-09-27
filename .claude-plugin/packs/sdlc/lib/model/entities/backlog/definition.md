---
format_spec: '[[S-0005-entity-definition-contract]]'
need_human_review: true
---
# Backlog

> Canonical companion definition per [[S-0005-entity-definition-contract]].

## Purpose

A Backlog item is a stray idea captured before triage — deliberately
unstructured, cheap to write, parked until someone decides whether it
becomes real work. Two usage patterns coexist: a multi-item dump file
(ideas struck through or deleted as they move on) and a
single-candidate file (the whole file is one idea; on promotion it
becomes an archive pointer to the artifact it produced).

A Backlog item is *not*:

- A Task. A Task has a spec and is dispatchable; a backlog item earns
  that shape at promotion.
- A Milestone. Same boundary, larger grain.

## Identifier

| Concern | Shape |
|---|---|
| Filename | `B-NNNN[-slug].md` — 4 base-36 chars, optional immutable slug |
| Wikilink | `[[B-NNNN-slug]]` |
| `id` frontmatter | `B-NNNN`; immutable; optional on legacy multi-item dumps |
| Numbering | base-36, collision-checked ([[D-0002-entity-identifier-shape]]) |

## Frontmatter

`BacklogContract` in `backlog/schema.ts` is the authoritative contract
(validated via `sdlc entities validate`); everything is optional — the
contract only binds shape when promotion or closure is recorded.

| Field | Required? | Notes |
|---|---|---|
| `type`, `schema_version`, `id` | optional | Dispatch tag; generation stamp; identity (legacy dumps may lack all three) |
| `status` | optional | Absent = raw idea. `promoted/task`, `promoted/milestone`, `promoted/decision`, `closed/abandoned`, `closed/duplicate`, `closed/delivered` |
| `likely_type` | optional | Non-binding triage hint — the entity-type slug the triager guesses the item becomes (`task`, `milestone`, `decision`, `driver`, …). Never constrains the promotion outcome |
| `result` | conditional | Wikilink to the produced artifact; required with `promoted/*`, `closed/duplicate`, and `closed/delivered` (freeform PR link/note for `closed/delivered`), forbidden with `closed/abandoned` (schema-enforced per status) |
| `tags` | optional | Filtering labels |
| `last_reviewed` | optional | Bumped by `/sdlc:backlog-triage` on any decision |
| `need_human_review` | optional | Review-tracking flag |
| `created_at` | optional | ISO 8601 datetime the entry was authored, finer than `created` |
| `provenance` | optional | What authored it when not by hand: a skill, tool, or import source |

## Body shape

Freeform by design — the body carries whatever shape the idea needs.
The `contract(...)` in `schema.ts` declares no sections (`allow_unknown: true`);
structure is imposed at promotion time, not capture time.

## Lifecycle

| Status | Meaning |
|---|---|
| *(absent)* | Raw idea (single-candidate) or ongoing dump (multi-item) |
| `promoted/task` | Became a task; `result:` points at it (task-shaped wikilink) |
| `promoted/milestone` | Became a milestone; `result:` points at it |
| `promoted/decision` | Became a decision; `result:` points at it |
| `closed/abandoned` | Won't do / no longer relevant; no `result:` |
| `closed/duplicate` | Already captured elsewhere; `result:` points at the canonical backlog |
| `closed/delivered` | Built directly, without going through a promoted artifact; `result:` is a freeform PR link or short note of what shipped |

All statuses are terminal — a backlog file never moves backward; the
promoted file stays as the idea's origin story.

## Relationships

- **Backlog → Task / Milestone / Decision** (`result:`): promotion
  provenance, shape-checked per status by the schema.
- **Backlog → Backlog** (`result:` with `closed/duplicate`): canonical
  capture pointer.

## Operations

| Name | Surface | Signature | Pointer | Description |
|---|---|---|---|---|
| create | runner | `backlog create [<slug>] [...]` | `solutions/ontological/lib/model/entities/backlog/ops/create.ts` | Author a backlog item with minted identity (the relocated `new_backlog.ts` core); slug optional — derived from `--title` via the shared `deriveSlug` when omitted |
| preview-id | cli | `sdlc backlog preview-id <title>` | `solutions/ontological/lib/model/entities/backlog/ops/preview-id.ts` | Read-only: report the slug + `B-NNNN` id `create` would assign for a title, plus exact/similar same-type slug collisions (writes nothing) |
| capture | cli, skill | `sdlc backlog capture <text>` / `/sdlc:backlog-capture` | `solutions/ontological/cli/backlog_cli/capture.ts` | Head over the rolling-PR `create` tail: freeform text → structured fields |
| capture-tail | cli | `sdlc backlog create --headline <h> [...]` | `solutions/ontological/cli/backlog_cli/create.ts` | Deterministic tail: land a capture on the rolling backlog PR |
| triage | skill | `/sdlc:backlog-triage` | `solutions/ontological/plugin/plugins/sdlc/skills/backlog-triage/` | Walk untriaged files: promote, defer, or close each |
| update | cli | `sdlc backlog update <backlog> --set <json>` | `solutions/ontological/lib/model/entities/backlog/ops/update.ts` | Apply JSON frontmatter updates, schema-validated (entity-agnostic engine in `model/ops/_update.ts`); null-deletes `result` for `closed/abandoned` |

The registered `backlog create` op is the relocated scaffolder core
(T-0010); its Surface is `runner` (module exists and is registered, not
yet a CLI subcommand — gains `cli` with T-0014). The rolling-PR capture
tail (`backlog_cli/create.ts`) is a distinct, not-yet-registered CLI op,
kept here as `capture-tail` so the two `create`-shaped invocations don't
collide in this table. Generic cross-entity ops (`audit`, `validate`,
`migrate`, `check-identifiers`) live under `solutions/ontological/lib/model/ops/`.

## Workflow invariants

- `promoted/*`, `closed/duplicate`, and `closed/delivered` carry
  `result:` (wikilink-shaped for the first two, freeform PR link/note
  for `closed/delivered`); `closed/abandoned` must not
  (schema-enforced).
- `/sdlc:backlog-triage` bumps `last_reviewed` on every decision,
  including defer, and may record `likely_type` on a deferred item; the
  hint never binds the eventual promotion.
- Promotion never deletes the backlog file — it becomes the pointer.

## Position in the entity model

**Work layer** of the five-layer model ([[D-ORMG-data-model]]) — the
intake end: ideas enter as Backlog, earn a spec at promotion, and
execute as Tasks.

## Summary

- Pre-triage idea capture — deliberately unstructured, cheap to write,
  terminal-stated once promoted or closed. ^summary
- Identifier: `B-NNNN[-slug].md`, base-36; optional on legacy dumps.
- Status: absent until promoted (`promoted/task`,
  `promoted/milestone`, `promoted/decision`) or closed
  (`closed/abandoned`, `closed/duplicate`, `closed/delivered`);
  `result:` shape-checked per status.
- Body freeform; structure arrives at promotion.
- Distinct from Task (has a spec) and Milestone (release narrative).
