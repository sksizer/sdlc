# Schema-bump checklist

Every task that results in an entity's `schema_version` being bumped
(e.g. a v1→v2 migration in `solutions/ontological/lib/model/entities/<type>/`) MUST answer the
five canonical questions below in its spec — concretely, before
`/sdlc:task-work` picks the task up.

The actual `schema_version` write happens in `/sdlc:entities-migrate`
(via `audit_entities.ts` / `migrate_entities.ts`), NOT in
`/sdlc:task-work` or `/sdlc:task-new`. `task-work` is the orchestrating
skill that implements the bump task by either (a) invoking
`/sdlc:entities-migrate` as part of the implementation, or (b)
hand-editing the schema + entity files for a one-shot case where the
migration tooling doesn't yet cover the shape. This checklist makes
sure the spec answers the five forking questions either path will
otherwise force the implementer to invent mid-flight.

Each question maps to a real behaviour in `/sdlc:entities-migrate` and to a fixture under
`solutions/ontological/plugin/plugins/sdlc/skills/entities-migrate/tests/fixtures/`. Leaving any of
them implicit is how the [[T-T5RB-consolidate-task-status-enum]] task ended up adding a
generalization for missing-`schema_version` files in commit `c050d0b` that should have been in the
spec.

This is a cross-entity convention because every entity type
(`backlog`, `epic`, `milestone`, `task`, future bug/feature/roadmap)
goes through the same five-way fork at migrate time. Per
`solutions/ontological/plugin/CLAUDE.md`'s "factor shared procedural prose into
`solutions/ontological/conventions/<topic>.md`" rule, the checklist lives here and
the consuming skills reference it by one-line bullet.

## The five questions

A schema-bump task spec is implementation-ready only when its
`## Approach` (or a dedicated `## Migration semantics` block) answers
all five:

1. **Missing `schema_version`.** What does the migrate flow do for
   files that predate the field entirely? Two real-world options:
   route the file through the v1→v(target) transform chain (treat
   absence as v1), or stamp the target version and assume the body is
   already shaped right. Pick one explicitly and name the fixture
   that pins the behaviour.
2. **Current `schema_version`.** Files already at the target version —
   pass-through with no diff, or re-stamp anyway (e.g. to enforce
   canonical-order)? State the expected exit-code shape and the
   fixture that locks it.
3. **Unknown legacy values.** What happens when `schema_version` is
   set to a value not in the known transform chain (e.g.
   `schema_version: 7` when the chain only covers v1→v2)? Hard error
   with non-zero exit, or skip-and-warn? Name the surfacing channel
   (stderr vs stdout vs JSON report).
4. **Error path.** When a transform within the chain itself fails
   (malformed body, validator rejects the post-transform shape), how
   does the migrate flow surface the failure? Specify exit code,
   stdout shape, and whether partial migrations are rolled back or
   left as-is for human triage.
5. **Stamp behavior post-migrate.** After the transform chain runs, where does `schema_version` land
   in the frontmatter — at the top, at the bottom, or via the canonical-order helper that
   `entities validate` (`solutions/ontological/lib/model/ops/validate.ts`) enforces? Name the helper
   if one applies.

The five answers should be testable: each maps to (or motivates) a
fixture directory and a row in the eval suite. If a question's
answer is "same as the last bump", say so explicitly — the linkage
is the point.

## How task specs cite this checklist

In a schema-bump task's `## Approach` section, lead with a short
table or numbered list answering all five questions, then proceed
with the migration steps. Reviewers (human or LLM) check the five
answers against this doc before stamping
`readiness_verified_at:`. The `/sdlc:task-ensure-ready` contract in
`solutions/ontological/lib/model/entities/task/implementation-ready.md` already requires a
concrete `## Approach`; this checklist is the schema-bump-specific
specialization of that requirement.
