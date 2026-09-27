# Op registry inclusion: consumer capabilities get verbs, internal lints get scripts

The op registry ([[D-0007-deterministic-op-substrate]],
[[D-H7FS-op-substrate-surface]]) is sdlc's public API. Every registered op is
product surface: it appears in `--help`, in the help goldens, in the generated
docs, and eventually on the MCP surface, and consumers may script against it.
That surface is expensive to grow and expensive to shrink, so registration is
gated by one question:

> **Would someone who installs sdlc as a product ever invoke this?**
> If not, it does not get a verb.

## Placement

| What it is | Where it goes |
| --- | --- |
| Consumer-facing deterministic capability — skills shell to it, consumers run it against THEIR corpus | Op registry (`defineOp`), a CLI verb |
| sdlc-internal self-lint — checks sdlc's OWN source against sdlc's own coding conventions | `solutions/ontological/scripts/`, wired via `sdlc.yaml` `verbs.check:` and lefthook; skills invoke the script directly |
| Check specific to the sksizer/dev monorepo — enforces THAT repo's conventions | Repo-level tooling in the consumer repo (`scripts/`, root lefthook); never inside `solutions/ontological` at all |

The third row is the consumer repo's own rule (recorded in its root
`CLAUDE.md`); it is listed here only to complete the picture. This document
governs the boundary between the first two rows.

## Gates are the subtle case

sdlc's own gates (skill-prose, worktree-scope, markdown-fixtures) ARE
registered ops, under the hidden `gate` noun. That is not an exception to the
criterion — it is the criterion applied: those gates enforce sdlc-general
conventions that travel with the product, and every consumer runs them against
their own checkout.

A check on sdlc's own source does not travel. The reference example is the
command-seam check (`solutions/ontological/scripts/check_command_seam.sh`): it enforces
"shell-outs go through `lib/util/command.ts`" — a rule about how sdlc itself
is written. A consumer never runs it, so it is a script, not an op.

## Relation to "deterministic ops as CLI verbs, never skill-side scripts"

The standing rule that deterministic capabilities become sdlc CLI verbs rather
than skill-side scripts governs **capabilities** — operations a skill
orchestrates on a consumer's corpus, which need the registry's schema,
help, and output contracts. An internal self-lint is not a capability; it is a
development-time quality check of sdlc's own source. The two rules compose:
capabilities go IN the registry, self-lints stay OUT of it. Neither belongs in
skill-side ad-hoc scripts.
