# Task file resolution

The canonical reference for resolving a task-naming argument. Every
skill that takes a `<slug-or-filename>` or `<absolute-path>` argument
points here instead of restating the call or the outcome prose.

## How to resolve

Run the deterministic op:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc task resolve <arg>
```

It implements the resolution order: absolute path → exact filename
(with or without trailing `.md`) → glob prefix (`<arg>*.md`) then
substring (`*<arg>*.md`) under `docs/planning/tasks/` → ambiguous or
not-found. The op (`solutions/ontological/lib/model/entities/task/ops/resolve.ts`,
[[P-0001]]) is the implementation; this document is its contract. See
`sdlc task resolve --help`.

## Outcome contract

| Outcome | Exit | Output |
|---|---|---|
| Resolved | 0 | Absolute task path on stdout — capture the path and its basename (filename without `.md`). |
| Not found | 1 | stderr `NO TASK FOUND for "<arg>"`. |
| Ambiguous | 1 | stderr `AMBIGUOUS: <comma-separated candidate filenames>`. Re-run with `--output json` to read the structured `candidates[]` array. |

## Ambiguous-match policy

The genuinely per-skill-varying part. Each skill declares which mode it
uses:

- **Interactive** — re-run with `--output json`, prompt the user via
  AskUserQuestion over `candidates[]`, and use the pick. Treat
  `NO TASK FOUND` as the outcome if the user bails.
- **Non-interactive** — surface the `AMBIGUOUS:` marker (candidate list
  verbatim) and let the caller handle it (retry with a more specific
  arg, skip, or surface to the user). Never prompt.

## No-argument behaviour

This reference covers resolution of an explicitly-named argument.
Skills that accept being called with no argument (e.g.
`/sdlc:task-work` picking the oldest `open/ready` task) implement their
own selection logic — that is not part of this reference.
