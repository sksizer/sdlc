# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.0] - 2026-09-28

Phase 13 of the sdlc plan (M-I6NE,
[#2421](https://github.com/sksizer/dev/pull/2421)) — the last phase of the
sdlc 0.8 roadmap (RM-E2L0), which now completes.

### Added

- `sdlc tui`: an Ink terminal UI over the op registry. A PR page shows real
  `pr survey` data with sort, filter and multi-select, and `u` dispatches a
  real `pr update --apply`; a Tasks page joins `task next` and `task
  inflight`. Respond, open-session, work and orchestrate are labelled stubs
  pending the session/router layer.
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- `@sksizer/command-seam` gains streaming and managed-process doors
  (T-TOFK); every `@sdlc:ignore-spawn` call site (`supervise`,
  `release-lib`, `install-desktop-apps`, the docs-site build, `quality
  run`'s log mode, session-attach, the terminal host) moves onto them, and
  `check_command_seam.sh` is now import-aware so an injected dependency no
  longer false-positives. ([#2421](https://github.com/sksizer/dev/pull/2421))

### Changed

- The audit-driven refactors: lease-payload mint-site consolidation, with
  transition/reconcile now delegating; oversized functions split across
  capability/task/migrate/validate and the dashboard; the `MigrationError`
  hoist; a shared `plugin/registry.ts` for info-report/resolve; and a
  util/config single-home sweep. ([#2421](https://github.com/sksizer/dev/pull/2421))
- The session-attach spawn, moved onto the streaming door, now reports the
  exit code instead of throwing.
  ([#2421](https://github.com/sksizer/dev/pull/2421))

### Removed

- **BREAKING:** the `sdlc quality baseline prune` CLI op — defined as a
  command but never invoked from production code, a skill, or another op;
  the underlying `prune()` helper remains in `baseline.ts` for future use.
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- Dead code and exports: the `lib/model/index.ts` barrel and its dangling
  `frontmatterOf`/`readFrontmatter` re-exports, dead default exports from
  the claims resolvers, the `projectSeedSet` re-export, the dashboard's
  `tcpProbe` helper, and the `projectRegistry()` singleton wrapper.
  ([#2421](https://github.com/sksizer/dev/pull/2421))

### Fixed

- `verify changes --base <branch>` preferring a local branch ahead of
  origin (T-PEUC). ([#2421](https://github.com/sksizer/dev/pull/2421))
- The empty-registry CLI help summary, which now falls back to lifecycle
  phases instead of showing nothing (T-H0SB).
  ([#2421](https://github.com/sksizer/dev/pull/2421))
- Stale-comment and stale-doc sweeps across `lib/model`, `quality`, and the
  docs/tests trees. ([#2421](https://github.com/sksizer/dev/pull/2421))
- The packaged Node CLI's `sdlc dashboard start`, which timed out
  ("dashboard did not confirm startup within 5s") because bundling collapsed
  every module's `import.meta.url` to `cli/sdlc.js`, so the detached child
  re-ran the whole CLI with `--host` as a bogus top-level flag; the child now
  re-enters through a real `dashboard start --foreground` CLI route. Also
  stops the packaged CLI printing `MODULE_TYPELESS_PACKAGE_JSON` on every
  invocation.
  ([#2434](https://github.com/sksizer/dev/pull/2434))
- The same self-invocation bug in the compiled binary (`bun build
  --compile`): `dashboard start`'s detached child and `backlog create`'s
  validation shell-out both re-invoked a `cli/sdlc.{js,ts}` path the
  binary's asset tar never ships, and a standalone binary has no argv slot
  for an entry path anyway (`argument NOUN: invalid choice: <path>`). Both
  now build their subprocess argv through one `sdlcSelfInvocation()` helper
  that resolves to `[binary]`, `[node, cli/sdlc.js]`, or `[bun,
  cli/sdlc.ts]` depending on how sdlc is running.
  ([#2434](https://github.com/sksizer/dev/pull/2434))

## [0.7.0] - 2026-09-28

v0.5.0 and v0.6.0 were never cut — this release rolls both up, covering
everything merged to main since v0.4.0: Phases 4 through 12 of the sdlc
plan, plus the Router, the forge port, detection consolidation, and the
lifecycle simplification.

### Added

#### Phase 4 — audit report

- A full audit of the sdlc plan: surface grading of every skill, CLI
  noun/op and `sdlc.yaml` config key; a code-quality review across
  `solutions/ontological` and its workspace-package dependencies (99
  findings); and reconciliation against the prior 2026-07-19
  simplification audit (79 of 96 items confirmed fixed). Report-only, no
  code changes. ([#2285](https://github.com/sksizer/dev/pull/2285))

#### Phase 5 — meta-defined `sdlc.yaml`, config CLI, hooks

- Every `SdlcConfigSchema` key now carries a typed `.meta()` block
  (`category`, `consumers`, `layers`, `applies_via`, `runs_in`), enforced
  by a completeness test.
- `sdlc config list|explain|get|set|unset`; `set`/`unset` write through
  `yaml-splice` and preserve every untouched byte of the file.
  `docs/sdlc-yaml-reference.md` is generated from the schema plus meta.
- `sdlc init` scaffolds a starter `sdlc.yaml`; `sdlc run <workflow>` runs
  a workflow through the step runner.
- `hooks:` config maps git hooks to workflow `run`/`script` steps
  (`when: always|deps-missing`, `on_fail: warn|block|park`); `sdlc hooks
  run <hook>`.
- `sdlc apply [--dry-run|--check]` applies hooks/harness/mcp appliers
  keyed by the meta's `applies_via`; `project doctor` reports drift.
  ([#2319](https://github.com/sksizer/dev/pull/2319))

#### Phase 6 — hosts and cross-host sessions

- New engine-native hosts under `lib/services/host/hosts/`: `claude`,
  `codex`, `cursor`, alongside the existing `terminal`/`orca`/`cmux`
  wrapper hosts.
- `sdlc session list` / `sdlc session attach <id>` read
  `.sdlc/sessions/<id>/record.json` across every host, zod-validated on
  read.
- A `sessions.workflows.<name>.{engine,host}` config section gives
  per-workflow defaults for `sdlc session launch`.
  ([#2327](https://github.com/sksizer/dev/pull/2327))

#### The Router — PR feedback delivery, pause/resume, per-item dispatch

- Delivers PR review feedback (comments, failing checks, merge
  conflicts) into the session that produced the PR, via an ordered
  fallback: `live` (opt-in, off by default) → `resume` → `fresh`.
- A global pause/resume switch for the orchestrator loops (`sdlc
  orchestrate pause|resume|status`, scoped per loop) and manual
  per-item dispatch escape hatches: `sdlc pr route`, `sdlc task
  dispatch`, both usable even while paused.
- New `orchestrator.router` and `orchestrator.review.response_policy`
  config. ([#2368](https://github.com/sksizer/dev/pull/2368))

#### Phase 7 — SDLC chain, stage labels, issue loop

- The `sdlc` chain: a fixed 11-stage pipeline (`capture` → `triage` →
  `define` → `ready` → `implement` → `check` → `judge` → `review` →
  `respond` → `merge` → `close-out`) formalizing orchestrator behavior,
  with a per-project `chain:` config override for a stage's bound
  workflow.
- A 22-label `sdlc:stage/<stage>` / `sdlc:auto/<stage>` vocabulary,
  managed by a new `labels` applier that never deletes a label it
  doesn't own.
- An optional task `issue` field linking GitHub issues to tasks
  (markdown stays the source of truth); `sdlc issues sync` reports —
  never auto-fixes — a mismatch between a linked issue's label and its
  task's status.
- A new `issues` orchestrator loop (`sdlc orchestrate run --loop
  issues`) walking open, chain-labeled GitHub issues one stage at a
  time up to each issue's autonomy ceiling.
- The `pr-review` skill: adversarial review of a PR diff against the
  S-0017 rubric, wired as the chain's `review`-stage workflow.
  ([#2330](https://github.com/sksizer/dev/pull/2330))

#### Phase 8 — notifications

- `notify:` config: `channels` (desktop / ntfy HTTP topic / webhook)
  and `events` (9 canonical names), cross-validated so an event can't
  name an undefined channel.
- `sdlc notify send --channel <name>` / `sdlc notify test`.
- Every orchestrator call site rewired onto the canonical event names —
  a hard cutover: `orchestrator.notify`, `'work-park'`, `'max-rounds'`
  and `'hook.parked'` are gone.
  ([#2372](https://github.com/sksizer/dev/pull/2372))

#### The forge port / `pr-update` extraction

- A synchronous `Forge` port (`listPrs`/`getPr`/`postComment`/
  `updateBranch`/`parsePrUrl`/`prForBranch`) with a `GithubForge`
  adapter; PR classification, the Router's feedback bundle, and the
  `prs` tick all read PR state through it.
- A `ForgejoForge` adapter and `selectForge` (GitHub for github.com,
  Forgejo otherwise, overridable via `forge.override`).
- `pr-update` extracted into its own workspace package,
  `packages/ts/pr-update`, with 5 injectable ports; `solutions/ontological`'s
  `pr survey`/`pr update` are now thin wrappers over it.
  ([#2373](https://github.com/sksizer/dev/pull/2373))

#### Phase 9 — MCP server

- `sdlc mcp start`: a stdio MCP server whose tool set is derived from
  the op registry — no hand-written tool schemas. Defaults to
  read-only ops (`mutating: false`), and every tool is confined to the
  server's own project root.
- `sdlc mcp register --harness claude|codex|cursor [--dry-run]` writes
  each harness's client config (`.mcp.json`, `.codex/config.toml`,
  `.cursor/mcp.json`).
- A minimal `mcp:` config section with `allow`/`deny` op-path lists
  (deny always wins). ([#2313](https://github.com/sksizer/dev/pull/2313))

#### Detection consolidation (M-LOCI)

- One TypeScript aspect-detection layer
  (`@sksizer/detect-runners/aspects`) underneath both runner tooling
  and dependency graphing (`@sksizer/manifest-graph`): each manifest
  type (Cargo.toml, package.json, justfile, mise config, lockfiles,
  Makefile, moon) is read once per directory.
- The cargo, node-scripts, just, mise and make providers consume the
  shared aspect facts instead of re-reading manifests themselves.
  ([#2393](https://github.com/sksizer/dev/pull/2393))

#### The lifecycle simplification — verbs → workflows (D-LSLH)

- One layered config resolver (env → local → project → default), used
  everywhere a workflow, hook, or chain stage is resolved.
- An opinionated verb vocabulary (fmt, fmt-check, lint, lint-fix,
  typecheck, test, test-int, test-e2e, build, clean), each resolved
  from project/local/env config, then a same-named task in the
  project's own runner, then the toolchain command for the detected
  aspect. The default `check` composes fmt-check + lint + typecheck +
  test.
- sdlc's own `detect-deps`, `pinned-manager` and `detect-setup` deleted;
  every consumer moved to `@sksizer/detect-runners`.
  ([#2399](https://github.com/sksizer/dev/pull/2399))

#### Sessions v2 — host/harness split, tmux + pi (M-TAYX)

- `HostName` (where a session runs: terminal/orca/cmux/tmux) and
  `Harness` (which CLI runs there: claude/codex/cursor/pi) split back
  into independent axes; any harness can now run in any host.
- A `tmux` host and a `pi` harness.
- `Host.send({cwd, text})` delivers a message into an already-open
  session, addressed by `cwd` alone (orca, tmux).
- `SessionNote`/`SessionRegistry`: one JSON file per lease under
  `.sdlc/dispatch/sessions/`, tracking `running | waiting_for_input |
  gone`, reconciled against what's actually alive.
  ([#2371](https://github.com/sksizer/dev/pull/2371))

#### Phase 11 — usage and cost tracking (M-U0LQ)

- Headless `session launch` runs capture token/cost usage to
  `.sdlc/usage.jsonl`; interactive runs read the Claude/Codex transcript
  by session id when the host waits.
- `sdlc usage report`, grouping by day, harness, workflow or subject.
- A `usage.budget` rolling-window ceiling (tokens or cost); exceeding it
  pauses the work tick's dispatch and sends the new
  `usage.budget_exceeded` notify event.
  ([#2407](https://github.com/sksizer/dev/pull/2407))

#### Phase 10 — OKF v0.2 conformance (M-LBU2)

- `sdlc okf validate` checks the corpus against an OKF-bundle allowlist,
  wired into the `check` workflow.
- OKF's optional keys admitted: `status: draft|stable|deprecated` under
  OKF's own meaning, and `provenance`.
  ([#2412](https://github.com/sksizer/dev/pull/2412))

#### Phase 12 — static SPA dashboard (M-VBZB)

- `packages/ts/dashboard-spa` (Vite + Vue 3 + vue-router), served by
  `sdlc dashboard`, replaces the old built-in `INDEX_HTML` page.
- Eight views, each backed by the dashboard JSON API: roadmap progress,
  loop status and tick log, PR board, chain stages and labels, config
  (read and edit), notifications, usage, and sessions.
- Two new ops back the new views: `roadmap progress` and `orchestrate
  log-tail`.
- Open-in-host: `POST /api/sessions/open` launches a new session or
  resumes a recorded one in its host, reusing `launchInteractive`.
- A CSRF gate on every non-GET/HEAD `/api/*` request: same-origin plus a
  per-process token (`x-sdlc-csrf-token`), with a Tauri-origin allowlist
  for the desktop shell.
- The three new `mutating: false` ops are exposed as MCP tools, taking
  the default set from 21 to 25.
  ([#2415](https://github.com/sksizer/dev/pull/2415))

### Changed

- **BREAKING:** entity frontmatter `status` → `state` across every
  entity type (schema bumps: task 8→9, capability 2→3, backlog 2→3, all
  others 1→2). Run `sdlc entities migrate` to bring an existing corpus
  forward. CLI flags follow: `--status` → `--state` on the task and
  backlog nouns. ([#2412](https://github.com/sksizer/dev/pull/2412))
- Config CLI spellings finalized: top-level `sdlc init` and `sdlc run
  <workflow>` replace `config init` and `workflow run`, with no aliases.
  ([#2319](https://github.com/sksizer/dev/pull/2319))

### Removed

- **BREAKING:** the `verbs:` config section — use `workflows:` instead;
  a bare string step is now a `script:` step.
  ([#2399](https://github.com/sksizer/dev/pull/2399))
- **BREAKING:** `orchestrator.workflows` and `sessions.workflows` — use
  `workflows.<name>.{engine,host}` instead.
  ([#2399](https://github.com/sksizer/dev/pull/2399))
- **BREAKING:** the `--host claude|codex|cursor|pi` legacy host/engine
  names and their config equivalents — `--engine`/`engine:` and
  `--host`/`host:` are now separate, validated axes.
  ([#2371](https://github.com/sksizer/dev/pull/2371))
- The `plugin_source` config key — the sdlc source tree now resolves
  from the running code. ([#2319](https://github.com/sksizer/dev/pull/2319))
- **BREAKING:** the built-in `INDEX_HTML` dashboard page — `sdlc
  dashboard` now serves the SPA in `packages/ts/dashboard-spa`.
  ([#2415](https://github.com/sksizer/dev/pull/2415))

### Fixed

- A driven follow-up from `/sdlc:spawn-task-pr` could land at
  `open/ready` without its `readiness_verified_at` stamp; promotion to
  `open/ready` is now exclusively the readiness gate's job.
  ([#2395](https://github.com/sksizer/dev/pull/2395))
- Follow-up: the readiness drive is now skipped entirely when the
  fallback status is `planning/needs-definition`, instead of silently
  exiting 20 on every spawn. ([#2413](https://github.com/sksizer/dev/pull/2413))

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
