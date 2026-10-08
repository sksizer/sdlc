# Schema-contracted skill reports

Review-style skills (today: `/sdlc:task-review`, `/sdlc:principle-review`,
`/sdlc:standard-review`)
emit their findings twice: a conversational inline summary, and a rendered
HTML report under `.sdlc/reports/` (gitignored runtime output, never
committed). The report is NOT hand-written HTML — it rides a deterministic
render pipeline with a schema-defined data contract.

## The split

- **The skill (LLM head)** synthesizes findings into a JSON payload.
- **`sdlc report render` (deterministic tail)** validates the payload
  against the kind's Zod contract, renders the kind's Eta template, and
  writes the artifacts.

This is [[P-0001]] (prefer-deterministic-over-llm) and [[P-0005]]
(schema-over-prose) applied to report output: the LLM owns judgment
(what the findings are), the pipeline owns presentation (how they render).

## Per-kind surface (a package under the kind's entity)

Reporting is a general capability — the engine, kind registry, and the two
ops live at `solutions/ontological/lib/services/report/`, and any producer (a skill,
another op, an external caller) can render against a registered kind. The
kinds themselves are entity-specific code, so each lives under its
entity's package at `solutions/ontological/lib/model/entities/<type>/reports/<name>/` —
a sibling of `ops/`, not inside it (the discovery walk imports everything
in `ops/` as op modules).

| File | Role |
|------|------|
| `solutions/ontological/lib/model/entities/<type>/reports/<name>/schema.ts` | The payload's Zod contract (zod/v4). `.describe()` annotations are the authoring doc. Exports a `ReportKind`. |
| `solutions/ontological/lib/model/entities/<type>/reports/<name>/template.eta` | HTML template consuming only validated data. Derives all counts from rows — payloads carry no totals to contradict. |

Today: kind `task-review` → `entities/task/reports/review/`, kind
`principle-review` → `entities/principle/reports/review/`, kind
`standard-review` → `entities/standard/reports/review/`. Adding a report
kind: write the two files above, add one entry to
`solutions/ontological/lib/services/report/kinds.ts`.

## Skill-side recipe

1. **Assemble the payload** per the kind's
   `solutions/ontological/lib/model/entities/<type>/reports/<name>/schema.ts` (read it —
   the schema IS the contract; `sdlc report get-schema <kind>` emits the same
   thing as JSON Schema). Compute nothing derivable: no totals, no tallies.
2. **Write it to a temp file** (e.g. `mktemp -t <kind>-report` + `.json`),
   not into `.sdlc/reports/` — the renderer owns that directory.
3. **Render** (no pipes — this is a gated command):

   ```text
   ${CLAUDE_PLUGIN_ROOT}/cli/sdlc report render <kind> <payload.json>
   ```

   On success the op prints `{ htmlPath, jsonPath, wrote }`. On a contract
   violation it exits non-zero with the Zod issues — fix the payload at the
   reported paths and re-run. Never fall back to hand-writing the HTML.
4. **Link inline.** Give the user a clickable link to the report —
   `file://<htmlPath>` — and mention the JSON sidecar, then continue the
   conversational summary. The report and the inline summary carry the
   same information; the report is the durable, shareable form.

## Artifacts

`<kind>-<meta.date>[-<suffix>][-<n>].html` + `.json` under
`.sdlc/reports/`. The date comes from the payload's `meta.date`, never the
clock; `-2`, `-3`… ordinals handle multiple runs per day. The JSON sidecar
holds the *validated* payload (defaults applied) so downstream consumers
read the post-contract shape.
