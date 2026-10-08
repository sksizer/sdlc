# Corpus-assumption scanner (advisory, LLM-judged)

`sdlc task scan-corpus-assumptions <path>` is a separate, advisory scanner
shared by `/sdlc:task-auto-define`, `/sdlc:task-define`, and
`/sdlc:task-ensure-ready`. It looks for uniform-corpus phrasing (e.g. "every
entity", "all instances", "the corpus") in a task's `## Approach` /
`## Proposed` section with no nearby tolerance/strictness signal:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc task scan-corpus-assumptions <path>
```

It emits one JSON line per candidate
(`{"section": ..., "signal": ..., "line": ..., "snippet": ...}`) on stdout;
exit 0 with empty stdout means no candidates.

## Confirm before treating a candidate as a gap

This scanner is **advisory, not a hard disqualifier**. A candidate becomes a
gap only after an LLM confirms it — never mechanically. For each candidate,
inspect the cited line and decide whether the Approach genuinely assumes a
single uniform corpus shape the corpus does not have (it is mid-migration:
different instances carry different shapes). If the corpus is genuinely
uniform, or the Approach already names the strictness/tolerance split, the
candidate is a false positive and is NOT a gap.

## Why it stays its own call

The scanner is deliberately **NOT folded into** `sdlc task gap-report` —
`gap-report` is a purely deterministic, no-LLM composite (required sections +
placeholders + claims), while this scanner requires confirm-before-gap LLM
judgment. Mixing the two would make `gap-report`'s output depend on LLM
interpretation, breaking its use as a fast, deterministic pre-check. Run it
as its own call, after reading the deterministic report.

As with any command a caller gates on: capture stdout into a variable if you
need to trim it — do not pipe through `tail`/`head` when gating (see
`${CLAUDE_PLUGIN_ROOT}/skills/CLAUDE.md`).
