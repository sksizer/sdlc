# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.11.0] - 2026-10-08

New `craft` skills, and the public repository now tags its own releases. The `sdlc` plugin and CLI
are unchanged from 0.10.0. `craft` ships as 0.3.0.

### Added

- `craft` gains three skills for reviewing work as a page:
  - `canvas` checks, renders and serves a typed document as one reviewable page: click a numbered
    node, read its section in the walkthrough, comment on selected words, answer the agent's
    questions, and the answers land in a JSON sidecar the agent reads back. Documents are lists of
    typed blocks (`prose`, `annotated-text`, `schema`, `operations`). Its peer scripts run under
    bun, Node 23.6+ or Deno with no dependencies and no build step.
  - `explain` writes one canvas document with no questions, for a reader who needs to understand
    something.
  - `propose-solution` writes one canvas document that ends in a decision, with a recommended
    answer for every trade-off the reviewer must ratify, so the page can be approved or sent back.
  - Both take a domain as their first argument and read `domains/<domain>.md` beside the skill;
    `sql` is the first domain (queries and schemas under `explain`, changes under
    `propose-solution`).
  ([#2935](https://github.com/sksizer/dev/pull/2935))
- The public `sksizer/sdlc` repository tags a release when its pull request merges: on a push to
  `main` it creates the annotated `v<version>` tag from the marketplace manifest, once
  `CHANGELOG.md` has a section for that version.
  ([#2939](https://github.com/sksizer/dev/pull/2939))

## [0.10.0] - 2026-10-08

The public `sksizer/sdlc` repository becomes a two-plugin marketplace. The `sdlc`
plugin and CLI are unchanged from 0.9.0.

### Added

- The public `sksizer/sdlc` repository now also publishes the `craft` plugin
  (script-free, portable skills) beside `sdlc`, for Claude Code, Codex,
  Cursor and Pi. Install it with `/plugin install craft@sdlc`. `craft` is
  versioned on its own and ships as 0.2.0, with seven skills: `research`,
  `decision-make`, `capability-groom`, `explore-codebase`,
  `api-enhancement-scan`, `skill-author` and `skill-review`.
- `craft`'s `skill-review` grades one skill or a plugin's skills against the
  `skill-author` checks and against each other (drift, dead references,
  overlap, two processes, orphans, vocabulary) and reports one
  recommendation per finding; `--fix` hands marked skills to `skill-author`.
  ([#2928](https://github.com/sksizer/dev/pull/2928))

### Changed

- `craft`'s `skill-author` calls other skills by wikilink, keeps prose short
  and maps non-linear flow; its agent-pants rules apply only when agent-pants
  is installed. ([#2928](https://github.com/sksizer/dev/pull/2928))

## [0.9.0] - 2026-10-08

Adoption, sessions and a safer orchestrator: the setup wizard becomes real
ops, every launch writes one session record, the orchestrator is safe to
run live, branch cleanup becomes plan, verify and apply, and the entity
commands gain a uniform read surface.

### Added

- `sdlc setup plan` and `sdlc setup apply [--choices <json|file>] [--up-to <step>]`:
  the adoption wizard's steps as ops. `plan` shows the file changes and
  notes without writing; `apply` makes them. Both are additive: a key
  already set, or a file that exists with different text, is reported and
  left alone, and nothing is removed, so replaying the same choices changes
  nothing. A default run writes only what every project wants (the
  `.gitignore` section, the `sdlc.yaml` skeleton and example docs); checks,
  extensions, sandbox lists and the look-back prompt are written only when
  chosen. Setup offers the runners it detected, can write machine-local
  choices to `sdlc.local.yaml`, and lists choices it cannot write yet
  instead of dropping them silently.
  ([#2822](https://github.com/sksizer/dev/pull/2822),
  [#2825](https://github.com/sksizer/dev/pull/2825),
  [#2827](https://github.com/sksizer/dev/pull/2827),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc harness detect [--write-host-default]`: reports the AI tools that are
  installed, local runtimes (Ollama, LM Studio) and their models, session
  hosts, and sign-in state (signed in or unknown, never "signed out"), and
  can write `host.default`. `project doctor` prints the same table.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc project doctor` checks authentication for the code host the repo
  uses and prints one fix line per failed check; it also prints the
  resolved tracker and code host and warns when `sessions.keep_raw` is set
  with a store outside the project.
  ([#2660](https://github.com/sksizer/dev/pull/2660),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- Unknown nouns, verbs, config keys and repo names get "did you mean"
  suggestions, and top-level `sdlc --help` shows a one-line summary for each
  noun. ([#2660](https://github.com/sksizer/dev/pull/2660))
- `sdlc shell completion`: bash, zsh and fish completion generated from the
  op registry. ([#2660](https://github.com/sksizer/dev/pull/2660))
- Every entity kind (backlog, capability, decision, driver, milestone,
  principle, product, reference, roadmap, standard, task, term) gets the
  same read verbs: `list`, `get`, `search` and `related`.
  ([#2664](https://github.com/sksizer/dev/pull/2664))
- The `note` kind (`N-XXXX`, a required `genre` and an optional `parent`)
  with `sdlc note create|get|list|preview-id|related|search`. A roadmap's
  `plan_doc` now links a note, and `roadmap check` resolves it
  (`missing_plan_note`). ([#2512](https://github.com/sksizer/dev/pull/2512))
- OKF v0.2 is the base contract: every entity accepts `description`,
  `resource`, `status`, `stale_after`, `generated`, `verified`, `sources` and
  `usage_window`, and `sdlc okf validate` walks `docs/` as a bundle (every
  non-reserved markdown file carries frontmatter with a `type`).
  ([#2512](https://github.com/sksizer/dev/pull/2512))
- Planning links on the capability graph: a capability can name its
  `product`, a milestone can list the `capabilities` it advances,
  `entities audit` reports a `dangling_link` for either, and `roadmap check`
  reports `missing_capability`.
  ([#2513](https://github.com/sksizer/dev/pull/2513))
- `sdlc capability graph` gains `--audience user|system`, `--tree` (indented
  containment tree), `--depth N` (with `--tree`; hidden children show a
  `(+K)` count) and `--unnested` (capabilities with no parent that are not
  a system root). `sdlc capability relations <id>` and
  `GET /api/capabilities/:id/relations` (client method
  `getCapabilityRelations`) return a capability's children, the milestones
  that list it and their open tasks.
  ([#2513](https://github.com/sksizer/dev/pull/2513),
  [#2595](https://github.com/sksizer/dev/pull/2595),
  [#2633](https://github.com/sksizer/dev/pull/2633))
- `sdlc roadmap check --strict-order` also reports ordered-flow findings
  (off by default). ([#2886](https://github.com/sksizer/dev/pull/2886))
- `sdlc config pin-test` records the project's test command once in
  `sdlc.yaml`; `pr_update.verify: test` runs only that recorded command.
  `sdlc config migrate-machine` upgrades the machine config file to the
  current version and keeps a `.bak`.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- `sdlc pr update`: a configurable `pr_update.repair.command` can fix a
  conflict or a failed verify (`pr_update.repair.on`); `--confirm-push` shows
  the commits and diffstat and asks before each force-push;
  `pr_update.max_failed_attempts` (default 1) and `--retry-failed` skip a PR
  whose update failed until its head or base moves.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- `sdlc pr review` refreshes a reused worktree, and updates the PR first when
  it is behind its base (`pr_review.refresh`: `update` (default), `pull` or
  `off`; `--no-refresh` for one run). `pr_review.related_prs` lists stacked
  and overlapping PRs in the review brief.
  ([#2662](https://github.com/sksizer/dev/pull/2662))
- Orchestrator safety: a new `CI-BLOCKED` verdict for checks that a billing or
  spending-limit block stopped (no `pr-respond` is dispatched for it);
  `orchestrator.pr_filters.exclude_drafts` (default `true`) and
  `include_labels` (opt-in) scope which PRs the `prs` and `merges` ticks touch;
  `orchestrator.limits.*` caps every session-starting dispatch (`implement`,
  `pr_review`, `pr_respond`, `pr_update`, `close_out`, `issues`, optional
  `total`, and `session_ttl_minutes`); `orchestrate run` lists every planned
  item, dry-run or live. ([#2462](https://github.com/sksizer/dev/pull/2462))
- Orchestrator efficiency and visibility: the `prs` tick lists open PRs and
  fully fetches only those whose `updatedAt` changed
  (`orchestrator.polling.full_refresh_secs`, default 900);
  `router.quiet_period_secs` (default 120) batches a reviewer's consecutive
  comments into one delivery; `sdlc orchestrate status --waiting` and a
  dashboard panel list the tasks and PRs waiting on a person.
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- Dispatch hardening: review feedback goes to a file under `.sdlc/feedback/`
  and the session gets a one-line pointer; the router never starts a second
  session beside a running one; the work tick re-checks `depends_on` before
  launching and holds the task as `blocked-deps`; `sdlc pr update` tells the
  live session on a rebased branch to fetch and rebase.
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- `sdlc session focus <target>` brings the terminal of a task, PR or branch
  forward, through a new optional host `focus` part (Orca and tmux).
  ([#2663](https://github.com/sksizer/dev/pull/2663))
- A `sessions:` config block (local layer): `sessions.store.path` and
  `sessions.store.layout` (`flat` or `by-project`) choose where session records
  live (default `.sdlc/sessions`), and `sessions.keep_raw` is reserved. Each
  session keeps an append-only `events.jsonl` log and a `machine` field, and
  records carry kind, origin, state, outcome and author. Session commands
  ignore other machines' records.
  ([#2823](https://github.com/sksizer/dev/pull/2823),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- A `tracker:` config block (`tracker.kind`, default `github`) behind a Tracker
  port with a GitHub Issues adapter, and the code host is its own port
  (`@sksizer/code-host`) that `pr survey` and `pr update` go through; every PR
  argument parses with one `parsePrInput`.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- Each PR head gets a step evidence ledger at `.sdlc/pr-evidence/<sha>.jsonl`,
  and every `sdlc.yaml` key carries an enforcement grade, projected into the
  generated `docs/sdlc-yaml-enforcement.md`.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- Safe branch and worktree cleanup: `sdlc project apply-cleanup --plan <file>
  [--row <category:id>] [--authorize <name[=category:id]>]` re-checks an
  approved plan, deletes compare-and-swap on the judged commit and writes a
  receipt. `sdlc project cleanup` now fetches first (`--no-fetch` to skip;
  a repo whose fetch failed is an error row), writes a plan with
  `--write-plan` or `--plan-out`, narrows to one branch with `--branch`,
  reports worktrees that are locked, hide index edits, nest repos or share a
  branch, and reports one remote checked out as several clones. Each row names
  the authorization its delete needs (`abandon-unmerged`, `discard-changes`,
  `confirm-open-pr`). `session-cleanup` runs on this plan and apply pair.
  ([#2640](https://github.com/sksizer/dev/pull/2640))
- `sdlc project follow <checkout> [--status]` fast-forwards a served project's
  detached checkout to `origin/main` when the tree is clean, and
  `sdlc project follow-loop start <checkout> [--interval <secs>]` repeats it
  (default 60s). ([#2597](https://github.com/sksizer/dev/pull/2597))
- Multi-root projects: `task resolve` searches every planning root,
  `task start` finds a task in a nested planning root, and every op builds
  worktree paths from one worktree root. ([#2560](https://github.com/sksizer/dev/pull/2560),
  [#2561](https://github.com/sksizer/dev/pull/2561),
  [#2566](https://github.com/sksizer/dev/pull/2566))
- Harness distribution: `sdlc dev install` writes the launcher as a real-file
  shim instead of a symlink; dispatched prompts pin the running `sdlc`
  (`SDLC_PINNED_CMD`, opt out with `--no-pin-sdlc`) and every launch and
  resume sets `SDLC_SESSION` and `SDLC_TASK`; a dispatched agent loads
  skills from a session-local plugin directory; harness plugins install
  through each harness's own CLI. ([#2661](https://github.com/sksizer/dev/pull/2661))
- A Pi export: the plugin builds a `.pi/` tree beside `.claude-plugin/`,
  `.agents/` and `.cursor-plugin/`, one Pi package per plugin, with skills
  named `<plugin>-<skill>` (install with `pi install <path>/.pi/packs/<plugin>`).
  Skill invocations in plugin source are `/[[skill]]` calls rendered in each
  harness's own spelling. ([#2482](https://github.com/sksizer/dev/pull/2482),
  [#2483](https://github.com/sksizer/dev/pull/2483))
- The dev-checkout launcher names the checkout and says `bun install` when a
  declared dependency is missing, instead of printing a module-resolution
  trace. ([#2599](https://github.com/sksizer/dev/pull/2599))
- `GET /api/entities/notes` and `/api/entities/notes/:id`; entity list rows
  carry `genre` and `parent`. ([#2569](https://github.com/sksizer/dev/pull/2569))
- The docs site builds a reference page for every plugin's skills, not only
  `sdlc`'s. ([#2835](https://github.com/sksizer/dev/pull/2835))
- `GET /api/session-records` and `getSessionRecords` in `@sdlc/dashboard-client`: the session
  store's records (state, author, origin, task, outcome) as typed JSON. The dashboard sessions page
  lists them above the Claude transcripts.

### Changed

- **BREAKING:** the per-lease session note (`.sdlc/dispatch/sessions/<lease>.json`) is deleted
  with `SessionNote`, `SessionRegistry`, `reconcileNotes` and `reportStatusEvent`. The session
  record is the only record: `session list`'s `state` column is now the record's `state`
  (`starting`, `running`, `waiting_for_input`, `idle`, `ended`), and is never `null`. Existing
  note files are no longer read; delete them. The hook-status mapping moved to
  `lib/services/session/hook-status.ts`.
- **BREAKING:** the `forge:` key in `sdlc.yaml` is renamed `code_host:`
  (`code_host.override` still takes `'github' | 'forgejo' | null`). A stale
  `forge:` key is an unknown key, and an invalid `sdlc.yaml` is fatal: the
  config refuses to load until `forge:` is renamed to `code_host:` (in
  `sdlc.local.yaml` too). There is no alias. The `Forge` port is renamed `CodeHost` throughout
  (`selectForge` -> `selectCodeHost`, `GithubForge` -> `GithubCodeHost`,
  `ForgejoForge` -> `ForgejoCodeHost`, `lib/services/pr/forge/` ->
  `lib/services/pr/code-host/`).
- The built-in `judge` workflow now runs `sdlc verify changes --blocking`
  (one `script:` step) instead of nothing. A project without its own
  `workflows.judge` now runs an AI review in the gate, which costs tokens;
  set `workflows.judge` to override it, or to `[]` to opt out. The step
  assumes `sdlc` is on `PATH`. (T-3N5B)
- **BREAKING:** `orchestrator.max_implementations` is now
  `orchestrator.limits.implement` (same default, 5). The orchestrator block
  rejects unknown keys, so `sdlc.yaml` refuses to load until you rename it.
  There is no alias.
  ([#2462](https://github.com/sksizer/dev/pull/2462))
- **BREAKING:** session records are one type. The field `hostSessionId` is now
  `harnessSessionId`, and a record written before the event log (or without
  `kind`, `origin`, `state`, `outcome`, `author` and `harnessSessionId`) fails
  the schema and is skipped by `session list`. Nothing migrates old records.
  ([#2823](https://github.com/sksizer/dev/pull/2823),
  [#2886](https://github.com/sksizer/dev/pull/2886))
- **BREAKING:** `entities validate` now fails a file stamped with an older
  schema version (`[schema_version/outdated]`), and `ensure-ready` refuses a
  task behind the current task schema. Run `sdlc entities migrate` first;
  `entities migrate --dry-run` now runs the transform chain in memory so each
  plan line says what changes (for example `v3 -> v9 (status -> state)`), and
  `entities migrate` is listed in help.
  ([#2600](https://github.com/sksizer/dev/pull/2600))
- The `harness` key in `sdlc.yaml` is no longer reserved: `sdlc apply` acts on it.
  ([#2886](https://github.com/sksizer/dev/pull/2886))
- `--project-root` help states the real default (the nearest directory above
  the cwd that holds an `sdlc.yaml`), not "cwd".
  ([#2602](https://github.com/sksizer/dev/pull/2602))

### Removed

- **BREAKING:** the `explore-codebase` and `api-enhancement-scan` skills
  leave the `sdlc` plugin. They moved to the portable `craft` plugin, which
  the sdlc product does not ship; install them from a source that carries
  `craft`. ([#2835](https://github.com/sksizer/dev/pull/2835))
- The legacy `docs/planning/backlogs/` directory alias: backlog entries load
  from `docs/planning/backlog/` only.
  ([#2770](https://github.com/sksizer/dev/pull/2770))

### Fixed

- A merged PR counts as proof that a branch landed only on an exact head-SHA,
  same-repo match; a closed task alone never turns an unmerged branch into a
  force delete; local-branch ancestry is measured against the remote default
  branch, and slashed default branch names are read whole. `task-close-out`
  deletes the remote branch only at the merged PR's head.
  ([#2640](https://github.com/sksizer/dev/pull/2640))
- A `BEHIND` PR no longer marks new review comments as read: they surface as
  `NEEDS-RESPONSE` once the branch is current.
  ([#2462](https://github.com/sksizer/dev/pull/2462))
- `sdlc pr update` no longer pushes a rebase that hit a second conflict
  half-replayed. ([#2662](https://github.com/sksizer/dev/pull/2662))
- Staging a path that begins with `-` no longer reads it as an option
  (`git add` always puts `--` before the paths).
  ([#2806](https://github.com/sksizer/dev/pull/2806))
- The docs site no longer strips `^2` out of `mc^2`: a block id needs
  whitespace or a line start before it.
  ([#2792](https://github.com/sksizer/dev/pull/2792))
- `sdlc gate corpus-invocation` no longer walks `node_modules` and follows
  symlinks (23 minutes became about a second), and reports the exempt
  runtime-conventions doc once. ([#2835](https://github.com/sksizer/dev/pull/2835))

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

## [0.3.1] - 2026-07-13

The first installable build of the CLI-primary distribution. Tagged `v0.3.1`
in the private `sksizer/dev` repo (merge of
[#740](https://github.com/sksizer/dev/pull/740); release commit
`1c652156ec`). This release and everything below it predate this changelog
and were reconstructed from the tags, the commit history and the planning
corpus; versions 0.3.x were never published to the public `sksizer/sdlc`
repo (see the note under 0.3.0).

### Fixed

- The published artifact could not be installed. 0.3.0 shipped the vendored
  `markdown-contract` as a `file:` tarball dependency, which does not
  survive a git or registry install: bun ignores `bundledDependencies` and
  npm's pack strips `node_modules`, so consumers hit an unresolvable
  `markdown-contract`. `sdlc plugin build-artifact` now esbuilds it into one
  self-contained file at `plugin/lib/_vendor/markdown-contract.js`, rewrites
  the import specifiers to point at it, drops `markdown-contract` from the
  published `package.json` and hoists its registry dependencies (`unified`,
  `remark-*`, `picomatch`). Those stay external so one shared copy of each
  (including `zod`) resolves across the sdlc and markdown-contract seam. The
  dev repo is unchanged: it keeps the vendored `file:` dependency.
  ([#738](https://github.com/sksizer/dev/pull/738); task T-XTGT)
- The release workflow gained a consumer-install smoke: pack the artifact,
  install it with `npm` into an empty directory outside the repo, assert
  `markdown-contract` does not reappear as an external package, then run
  `--help` and `project doctor --output json` from `node_modules`. The
  release job also refuses to publish unless the bundled
  `plugin/lib/_vendor/markdown-contract.js` is staged.

### Changed

- The harness core (model, deriver, and the claude, codex, cursor, gemini
  and json exporters) moved out of `plugin/lib/services/harness` into a new
  workspace package, `@sksizer/agent-plugin` (`packages/ts/agent-plugin`).
  The `sdlc harness export|model|install` ops now import it.
  ([#734](https://github.com/sksizer/dev/pull/734))
- The repo's moon configuration moved to moon v2
  ([#739](https://github.com/sksizer/dev/pull/739),
  [#741](https://github.com/sksizer/dev/pull/741)), a repo-wide Rust aspect
  (rustfmt, clippy, test) was added
  ([#717](https://github.com/sksizer/dev/pull/717)), and the Polish app came
  into the monorepo as `apps/polish`
  ([#716](https://github.com/sksizer/dev/pull/716)). These affect the dev
  repo's build only, not the shipped CLI or plugin.

### Known limits

- 0.3.0 stays a known-broken tag (not installable); use 0.3.1.
- The package is `"private": true` in the repo and was distributed only
  through the git-pinned dist channel described under 0.3.0, not a registry.
- `plugin/.claude-plugin/plugin.json` still reads `0.2.0` at this tag; the
  release version is the root `package.json` version, `0.3.1`.

## [0.3.0] - 2026-07-13

The first CLI-primary distribution: `sdlc` stops being a Bun-only,
symlink-installed Claude Code plugin and becomes a plain-Node artifact,
`@sksizer/sdlc`, that carries both the `sdlc` CLI and the Claude plugin
tree. Tagged `v0.3.0` (annotated, "first CLI-primary dist release (D-0014 /
T-75UD)"; merge of [#737](https://github.com/sksizer/dev/pull/737)). The
install it describes did not work (see 0.3.1).

This section covers the whole state at the tag, including work from the
weeks after 0.2.0 that was never tagged (2026-06-07 to 2026-07-13).

### Where this version lived

The 0.3.x line is the private `sksizer/dev` lineage: a TypeScript plugin and
CLI under `plugin/`, which later moved to `solutions/ontological/` and
became 0.4.0. It is not the same thing as the Python `darkfactory` code
that the public `sksizer/sdlc` repo held before 0.4.0 (tag `python-legacy`,
`darkfactory` `__version__ = "0.1.0"`, a PRD-harness CLI named `prd` with
no sdlc plugin). The public repo's first sdlc tag is `v0.4.0`; it has no 0.3.x tag.

### Added

- Distribution per decision D-0014. One npm artifact, `@sksizer/sdlc`
  (`bin: sdlc`, `files: plugin, vendor, README.md`), carries the CLI and the
  plugin directory, so the skills and the CLI that they call cannot skew.
  - `sdlc plugin build-artifact` stages the publishable tree: built JS
    (Node refuses to type-strip TypeScript under `node_modules`), run by
    `prepack`. Verified by an npm-pack install that runs `npx sdlc` on
    plain Node with Bun absent. ([#700](https://github.com/sksizer/dev/pull/700);
    task T-XTGT)
  - Shipped code is runtime-agnostic: `Bun.*`, `import.meta.dir` and
    `import.meta.main` were removed from every shipped tree and the new
    `sdlc gate runtime-agnostic` keeps them out
    ([#692](https://github.com/sksizer/dev/pull/692),
    [#697](https://github.com/sksizer/dev/pull/697)). Engines in the
    manifest: `node >= 24`, `bun >= 1.3`.
  - A release workflow (`.github/workflows/release.yml`,
    [#709](https://github.com/sksizer/dev/pull/709),
    [#730](https://github.com/sksizer/dev/pull/730); task T-75UD). Pushing a
    `vX.Y.Z` tag checks the tag against `package.json`, runs the
    `sdlc.yaml` quality roster, builds the artifact, smoke-tests it under
    Node 20 with Bun stripped from `PATH`, and pushes the built tree to a
    private mirror, `sksizer/sdlc-dist`, tagged to match. Consumers pin it
    as a git dependency (`sdlc-dist#vX.Y.Z`): no registry. A manual
    dry-run dispatch builds and smokes without publishing. Setup of the
    mirror and the deploy-key secret was manual.
  - Onboarding is three verbs: `bun add -d @sksizer/sdlc` (or
    `npm i -D`), `sdlc project setup`, `sdlc harness install claude`.
  - `sdlc harness install claude [--mode copy|node-modules|link] [--dev]`
    wires the harness into a consumer project idempotently (auto-detects
    link for a source checkout, copy for an installed package; idempotent
    settings merge). `--dev` registers the live source and writes to
    `.claude/settings.local.json`. `project doctor` gained a same-install
    check and reports `dev/linked`.
    ([#699](https://github.com/sksizer/dev/pull/699),
    [#707](https://github.com/sksizer/dev/pull/707))
  - `sdlc dev use <path> | off | status | link`: points a PATH-installed
    `sdlc` at a live checkout. The launcher resolves its source as
    `SDLC_HOME`, then the XDG `sdlc/home` config, then local (config is
    ignored when `CLAUDE_PLUGIN_ROOT` is set).
    ([#708](https://github.com/sksizer/dev/pull/708))
  - Skills call the `${CLAUDE_PLUGIN_ROOT}cli/sdlc` launcher, which picks
    runtime and entry; `sdlc gate corpus-invocation` forbids raw
    `cli/sdlc.ts` calls in skills
    ([#698](https://github.com/sksizer/dev/pull/698)). Self-location walks
    up to the project's `sdlc.yaml` instead of assuming a code root
    ([#701](https://github.com/sksizer/dev/pull/701)).
  - `sdlc site build`: generate, package-manager detect, `astro build`, and
    report the dist path, so a consumer builds the docs site without Bun
    ([#705](https://github.com/sksizer/dev/pull/705)).
- `sdlc harness export <target>`, `sdlc harness model`: derive a
  host-neutral model of the plugin (capabilities, hooks, MCP servers,
  permissions, documents) and project it to `claude`, `codex`, `cursor`,
  `gemini` or `json` (a verbatim `harness.json`), with `--dry-run`; plus
  an import bootstrap from the Claude surface. Skill and document bodies
  validate through markdown-contract.
  ([#720](https://github.com/sksizer/dev/pull/720),
  [#721](https://github.com/sksizer/dev/pull/721),
  [#722](https://github.com/sksizer/dev/pull/722),
  [#725](https://github.com/sksizer/dev/pull/725),
  [#726](https://github.com/sksizer/dev/pull/726),
  [#727](https://github.com/sksizer/dev/pull/727),
  [#728](https://github.com/sksizer/dev/pull/728))
- Entity types (11, each with a schema, template and docs under
  `plugin/lib/model/entities/<type>/`): backlog, capability, decision,
  driver, milestone, principle, product, reference, standard, task, term.
  `reference` (prefix `RF`) and `term` (`TM`) arrived after 0.2.0;
  `sdlc reference create` and `sdlc term create` mint them.
- Docs generation: `sdlc docs generate [index|glossary|references|site]`
  replaced `sdlc index generate`. The docs site is a pure build artifact
  (the whole content root is generated; hand-written pages live under
  `sites/df-docs/supplemental/` and are declared in `site.yaml`), with a
  `--check` drift gate wired into `quality_checks`. The glossary and
  references appendix are generated from `term` and `reference` entities.
- Monorepo: shared framework packages, the family app and scoped tooling
  came under `apps/` and `packages/ts/`
  ([#711](https://github.com/sksizer/dev/pull/711),
  [#712](https://github.com/sksizer/dev/pull/712),
  [#715](https://github.com/sksizer/dev/pull/715)).

### The CLI at this tag

Visible nouns: `commit`, `config`, `dashboard`, `dev`, `docs`, `entities`
(`validate`), `harness` (`export`, `install`, `model`), `milestone`
(`create`), `orchestrate` (`log-tick`, `watch`), `project` (`cleanup`,
`detect-worktree-init`, `doctor`, `preflight-worktree`, `scan`, `setup`,
`teardown-worktree`), `quality` (`baseline`, `detect`, `run`), `reference`,
`report`, `site`, `standard` (`create`, `preview-id`, `supersede`,
`update`), `task` (`create`, `inflight`, `next`, `preview-id`,
`probe-state`, `resolve`, `update`), `term`, and `backlog`. Hidden behind
`--advanced`: `gate` (`corpus-invocation`, `markdown-fixtures`,
`runtime-agnostic`, `skill-prose`, `worktree-scope`), `lease`, `plugin`
(`build-artifact`, `info`, `install-permissions`, `resolve`) and `pr`
(`classify`). There is no `roadmap`, `note`, `session`, `verify`, `judge`
or `setup plan|apply`; those came in 0.4.0 and later.

### Skills

36 skills under `plugin/skills/`, invoked as `/sdlc:<name>`:
`api-enhancement-scan`, `backlog-capture`, `backlog-triage`,
`consolidate-task-prs`, `docs`, `entities-audit`, `entities-migrate`,
`explore-codebase`, `find-quality-checks`, `find-worktree-init`,
`import-planning`, `info`, `migrate`, `migrate-runtime-state`,
`milestone-new`, `milestone-review`, `milestones-from-file`,
`orchestrate`, `pr-check`, `pr-respond`, `principle-review`, `product-new`,
`project-cleanup`, `review-todos`, `setup`, `spawn-task-pr`, `standard-new`,
`status-dashboard`, `task-auto-define`, `task-close-out`, `task-define`,
`task-ensure-ready`, `task-new`, `task-review`, `task-work`,
`update-skill-doc`. Plugin layout was the bespoke
`plugin/.claude-plugin/plugin.json` plus `skills/<name>/SKILL.md`; the
0.4.0 vault conversion replaced it.

### Configuration

`sdlc.yaml` at the project root, with `quality_checks` (a flat list of
commands run by `/sdlc:task-work` and `sdlc quality run`),
`lease_authority`, `docs_site` and worktree-init settings. There is no
`workflows:`, `verbs` or `host` section yet.

### Known limits

- The git-pinned `sdlc-dist` channel needed manual setup of a private repo
  and a deploy key, and was a stopgap. Decision D-2APS (2026-07-14)
  replaced it with a compiled `bun` binary wrapped for npm; T-75UD was
  closed as obsoleted.
- Not installable as published; fixed in 0.3.1.
- The Claude plugin manifest still said `0.2.0` and the marketplace entry
  `0.1.1`; the release version lived only in the root `package.json`.

## [0.2.0] - 2026-06-06

Not tagged; the date and contents come from the project's own site
changelog (`sites/df-docs/supplemental/changelog.md`) and the manifest
(`plugin.json` `0.2.0`). The op-substrate sweep (milestone M-0003): every
capability that lived in `plugin/scripts/` and `plugin/validators/` moved
into `plugin/lib/` as a registry op or service, and the `sdlc` CLI became
the sole entry.

### Added

- A path-keyed op registry (`defineOp`, 2 to 3 segment kebab paths),
  `defineService` for long-running capabilities (the dashboard, the lease
  heartbeat loop), `--output text|json|jsonl`, op render hooks, and a
  `SERVICE_ERROR` exit tier.
- 11 visible nouns (`task`, `backlog`, `milestone`, `standard`, `entities`,
  `commit`, `report`, `index`, `quality`, `project`, `dashboard`) and 4
  hidden (`plugin`, `pr`, `gate`, `lease`).

### Removed

- `plugin/scripts/`, `plugin/validators/` and `plugin/cli/lease_cli`.
  Skills no longer shell out to `${CLAUDE_PLUGIN_ROOT}scripts/X.ts`; they
  call `sdlc <path...>`.
