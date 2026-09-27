# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-09-25

Phases 1-3 of the sdlc plan (PR [#2284](https://github.com/sksizer/dev/pull/2284)).

### Added

#### Phase 1 — tracking, strict loop, relaxed task contract

- A `roadmap` entity type with create/check ops, so a phased plan is a
  checkable artifact rather than prose.
- A strict `check` verb: typecheck, tests, `entities audit --strict`,
  `roadmap check`, and `docs generate --check`.
- A `judge` verb, running `verify changes` against the fixed S-0017
  code-review rubric shared by human and agent reviewers.
- The task contract relaxed: `## Files to touch` became advisory `## Areas`,
  `## Today` became free prose (schema v6 -> v7, migrated across the
  existing task corpus) — Goal/AC/verification/out-of-scope stay strict.

#### Phase 2 — CLI orchestrator loops

- A `workflows:` section in `sdlc.yaml`: ordered `skill:`/`run:`/`script:`/
  `prompt:` steps, with built-ins (`implement`, `check`, `judge`,
  `pr-review`, `pr-respond`, `pr-update`, `close-out`, `define`) shipped in
  code and project-overridable.
- `sdlc session launch` — a headless-capable session runner (extracted from
  `pr review`), writing session records under `.sdlc/sessions/<id>/`.
- `sdlc orchestrate run --loop work,prs,merges` — per-item leases and a
  park-and-notify path on block, dispatching work and tending PRs and
  merges.

#### Phase 3 — canonical agent-pants vault

- sdlc's own plugin identity and every skill converted from the bespoke
  `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md` layout onto the
  agent-pants vault shape: a `sdlc.md` plugin note, per-skill `<name>.md`
  vault notes, and a `marketplace-sdlc` marketplace note.
- A nested `solutions/ontological/agent-pants.yaml` build config for a
  vault root nested inside a larger non-vault tree.
- `agent-pants build`/`check` joined as a drift gate on the `check` verb,
  with a `--watch` dev loop.
- `sdlc harness export` and `agent-plugin`'s exporters retired; `pr-tools`'
  `check-pr` reconciled with `sdlc:pr-respond`.
