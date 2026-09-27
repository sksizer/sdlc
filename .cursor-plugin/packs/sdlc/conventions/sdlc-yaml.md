# `sdlc.yaml` — per-project SDLC configuration

`sdlc.yaml` is a top-level configuration file (placed at the project root,
alongside `README.md` / `CLAUDE.md`) that declares per-project runtime
choices for the sdlc plugin's skills. It is operational config, not a
planning artifact — it does not live under `docs/planning/` and is not
managed by `/sdlc:setup`'s entity-schema machinery.

## Where the shape lives

The **authoritative source of truth** for `sdlc.yaml` is the Zod schema
`SdlcConfigSchema` in `solutions/ontological/lib/config/load.ts`. Every supported
top-level key, its type, its default, and its description live there as
`.describe()` and `.default()` annotations. This prose doc covers the
"why" (what each key is for, which skills consume it, when to set it) but
does not re-state the field list.

`SdlcConfigSchema` is the **only** validation path. There is no generated
JSON-Schema artifact and no AJV validator: both `loadConfig`'s hydration
and the strict surface (`validateFile`, and `lib/config/verbs.ts`'s
`resolveVerb` when it validates, via the `.safeParse` core in
`solutions/ontological/lib/config/schema.ts`) validate against this
one Zod schema. To export a JSON Schema for an external tool, generate it
on demand from `SdlcConfigSchema` with `zod-to-json-schema`; nothing is
checked in, so there is no resync step and no drift to guard.

## Single hydration point

All in-process consumers route through `loadConfig(projectRoot)` from
`@lib/config`. It is called once by `createCtx` in `solutions/ontological/lib/registry.ts`
and stored on `ctx.sdlcConfig`. Handlers read config via `ctx.sdlcConfig`
— no secondary YAML reads.

`loadConfig` contract:

- Returns a fully-typed `SdlcConfig` with all defaults filled by Zod.
- **Never throws.** On missing file / YAML error / schema-invalid document
  → degrades to the all-defaults object (same as an empty file).
- Memoized per resolved absolute path. Call `clearConfigCache()` between
  tests.

For the strict surface (schema validation / error reporting to humans),
use `validateFile` from `@lib/config` — it validates via `SdlcConfigSchema`
`.safeParse` and renders each Zod issue as an `at <location>: <message>`
diagnostic line. The exact message text is locked by
`solutions/ontological/lib/config/schema.test.ts`.

To see the full field-by-field reference, read the Zod source directly:

```text
cat solutions/ontological/lib/config/load.ts
```

## Location

The file lives at `<project-root>/sdlc.yaml`. The path is pinned so
skills can discover it without project-specific configuration. It is
kept top-level (not under `.claude/`) so it sits next to the other
"how this project works" documents and is visible at a glance.

`/sdlc:setup` (via `sdlc project setup`) scaffolds a fresh `sdlc.yaml`
**fully defined**, and it is a **schema-driven projection of
`SdlcConfigSchema`** — not a hand-maintained template. `configScaffoldYaml`
(`solutions/ontological/lib/config/scaffold.ts`) walks the schema and emits every key (nested
included) at its default value, with the schema's own `.describe()` prose as
comments and enum choices inlined; optional keys with no default are emitted
commented. This is "parse over validate": the schema is the single typed
source of truth, so a new key / changed default / reworded description flows
into the scaffold automatically and **cannot drift** by construction (a bug
would fail `solutions/ontological/lib/config/scaffold.test.ts`). The emitted values
equal the all-defaults object, so writing the file changes no behavior; it only
documents the surface. Preview or regenerate it any time with `sdlc config
scaffold`.

## Shape at a glance

A minimal example covering every supported key:

```yaml
verbs:                      # named lifecycle verbs: setup, setup-hooks, check
  setup:
    - bun install
  setup-hooks:              # optional; absent/null → fallback to setup, [] → no-op
    - bun install --frozen-lockfile --filter '@myname/my-package'
  check:
    - bun run lint
    - bun test

orchestrator:
  max_implementations: 5    # cap on concurrent /sdlc:task-work sub-agents
  max_awaiting_review: 20   # informational ceiling on open PRs awaiting review
  review:
    command: '/pr-tools:review-pr {pr} --mode auto'  # Step 2a's per-PR command

pr_update:                  # sdlc pr survey / sdlc pr update
  author: null              # null = every author; '@me' = just yours
  include_drafts: true      # drafts drift too
  strategy: rebase          # rebase | merge
  overrides:                # first match wins; beats the preference guards
    - base: 'release/*'
      strategy: merge
  guards:
    unpushed_local: skip    # skip | merge — never force-push over unpushed work
    reviewed: merge         # merge | rebase — a rewrite outdates review threads
    max_rebase_commits: 20  # above this, merge instead of replaying; 0 disables
  lockfile_install: null    # verb that re-derives lockfiles, e.g. 'bun install'
  resolvers: []             # [{paths: ['docs/index.md'], run: 'sdlc docs generate'}]
  verify: none              # none | check, before a push

task:
  execution:
    spawn_from_post_mortem:
      enabled: true                  # spawn follow-up tasks from post-mortem friction bullets
      drive_to_ready: true           # best-effort drive each spawned task to open/ready
      fallback_status: planning/draft  # status when a task can't be driven to ready
      target:
        pr_grouping: per-task        # per-task | per-execution | per-project
        pr_title_pattern: null       # optional PR title template; null = mode default

backlog:
  capture:
    enabled: true                    # sdlc backlog create auto-opens/updates a PR
    target:
      pr_grouping: per-project       # per-project (rolling) | per-item
      pr_title_pattern: null         # optional PR title template; null = mode default

paths:                      # named directories; other path settings say {name}
  dev: ~/Developer

repos:                      # directories that CONTAIN checkouts, at any depth
  - '{dev}'

checkout:                   # sdlc repo checkout <url>
  layout: '{dev}/{repo}'    # tokens: {host} {owner} {repo} + every paths: name
  protocol: https           # https | ssh, for a bare owner/repo input

host:
  default: terminal         # terminal | orca | cmux

pr_review:                  # sdlc pr review
  engine: claude            # claude | codex
  untrusted: skip-init      # skip-init | full | refuse
  setup: true               # run setup on every launch; --no-setup skips it

verify:                     # sdlc verify changes
  engine: claude            # claude | codex | gemini | opencode
  blocking: false
```

Every top-level key is optional. An entirely empty file (or a missing
file) is valid and means "no preferences set." `additionalProperties:
false` on the schema means typos at the top level (e.g. `vebs:` instead
of `verbs:`) are caught — see the validator output for the specific key
name.

## Keys — the "why" (the "what" is in the schema)

### `verbs:` — named lifecycle commands

A map of name → list of shell verbs. Each verb is the exact command line a
human would type, invoked through a shell (`sh -c "<verb>"`). Verbs are the
canonical home for every lifecycle command this project's tools run:
`/sdlc:task-work` Step 4 (setup), Step 7 (check), `sdlc pr review` (setup),
ephemeral commit-worktrees (setup-hooks), and `sdlc quality run` (any named
verb). Baseline names `setup`, `setup-hooks`, and `check` are run by SDLC
itself; [[S-0013-baseline-task-vocabulary]] names (`fmt`, `lint`, `test`,
`build`, etc.) pass through unchanged; any other name is allowed and validated
for shape only (non-empty string list). sdlc's own `setup`/`check` sit above
the S-0013 runner vocabulary — a project's S-0013 tasks (`moon run fmt`, etc.)
are typically what a `verbs:` entry invokes.

Execution semantics:

- Each verb is invoked through a shell. Multi-word verbs, pipes, and
  redirections work (`just full-check`, `cmd | grep foo`, etc.). Cwd varies
  by consumer: task-worktrees run in the worktree root; ephemeral
  commit-worktrees run in their detached root; other contexts (quality run)
  default to the project root or explicit override.
- Order matters: verbs execute sequentially; the first failure aborts
  the run.
- Empty list (`verbs.check: []`) and missing name both mean "nothing" for
  baseline verbs, with one exception: `setup-hooks` absent falls back to
  `setup` (same cascade logic as below); explicit `[]` means no fallback.

Examples:

```yaml
verbs:
  setup:
    - bun install
  check:
    - just full-check
    - npm run lint
    - npm test
```

```yaml
verbs:
  check:
    - solutions/ontological/cli/sdlc entities audit
    - bun test solutions/ontological/plugin/plugins/sdlc/skills/entities-audit/tests/run_evals.test.ts
```

#### Baseline-gated mode: isolating pre-existing drift

Some `verbs.check` entries (notably `sdlc entities audit`) audit the
entire entity corpus on every run and emit findings that may already
be present on `origin/main` — drift the current branch did not
introduce. Without a baseline, the gate forces every operator to
triage those pre-existing findings on every task pickup. To close
that friction, `sdlc quality run` accepts a memoized baseline
keyed on the `origin/main` SHA and gates only on findings the
current branch introduced.

Two flags participate:

- **`--baseline-dir <path>`** — directory holding the per-SHA
  baseline JSON files. Defaults to
  `<project-root>/.sdlc/quality-baselines/`. The directory is
  auto-created on capture and gitignored as part of `.sdlc/` — every
  developer's baselines are local-only; nothing is committed.
- **`--diff-against-baseline <sha>`** — switches the gate from raw
  exit codes to a finding-set diff against the baseline at
  `<baseline-dir>/<sha>.json`. Findings present in both surface on
  stderr prefixed `pre-existing: <verb>: <line>` (visible but
  non-gating). Findings present only on HEAD surface as
  `new-drift: <verb>: <line>` (visible AND gating). Exit 0 iff zero
  new-drift entries.

The baseline file is written by `sdlc quality baseline capture` —
typically invoked from `/sdlc:task-work` Step 3a against the
current `origin/main` SHA, well before any code is written. Its
on-disk shape is:

```json
{
  "sha": "<git sha>",
  "captured_at": "<iso8601 UTC>",
  "verbs": {
    "<verb>": {"exit": <int>, "findings": ["<line>", "..."]},
    ...
  }
}
```

Capture also prunes `<baseline-dir>` to the 5 most-recently-mtimed
JSON files on every call, so the cache stays bounded across
multiple in-flight branches without manual cleanup.

`--log` is incompatible with `--diff-against-baseline` because the
gate needs to capture each verb's stdout to compute the diff. Passing
both warns and coerces to `--line`.

## Resolution: the verb cascade

Every tool that runs a verb (task-work, pr review, quality run, or
ephemeral commit-worktree arming) calls the same resolver: `resolveVerb(name,
repoRoot)` from `lib/config/verbs.ts`. It picks the effective verb list for
a name by walking four layers in order, highest layer wins per name (the
whole list replaces, never merges):

| Layer | Where | Source tag | Whose |
|-------|-------|------------|-------|
| Environment | `SDLC_VERB_<NAME>` (uppercase, `-` → `_`), newline-separated; an empty value means `[]` | `env` | the person's, a one-run override |
| Local | `<repoRoot>/sdlc.local.yaml` `verbs.<name>` | `local` | the checkout's |
| Project | `<repoRoot>/sdlc.yaml` `verbs.<name>` (via `loadConfig`) | `project` | the repository's |
| Default | Heuristic, `setup` only (below) | `default` | inferred from the repository |
| None | Name absent from all layers | `none` | — |

**The default heuristic (setup only).** When no config layer carries `setup`,
the resolver probes the repo with `detect-runners#collect`, passing
`allowExec: isRepoTrusted(repoRoot) || trust` — the ONE place trust changes
what a verb RESOLVES to, not merely whether it may run (see Trust, below). A
single `just`/`moon`/`mise` task named `setup`, `install`, or `bootstrap`
becomes `setup`. Otherwise, a single lockfile-driven package-manager install
(from `detectDeps`) becomes `setup`. More than one candidate at any step
(ambiguity) yields `source: 'none'` — no guess. Under `allowExec: false`
(the repo is not trusted and no per-run `--trust` applies) only parse-kind
runners surface tasks: `just` does, `moon` and `mise` (exec-kind, readable
only by running them) contribute nothing until the repo is trusted (`sdlc repo
trust`) or a per-run `--trust` flag lets the probe execute.

**The `setup-hooks` fallback.** When `setup-hooks` is absent from all three
config layers (env, local, project), `resolveVerb('setup-hooks', …)` walks
the cascade FOR `setup` and returns that result verbatim (so `source` reports
where `setup` actually came from). Explicit `setup-hooks: []` in any layer
means "no fallback" — that name is satisfied and setup-hooks runs nothing.

**Cross-repo validation.** When `repoRoot` differs from the preflight cwd
(e.g., `sdlc pr review <url>` targeting another repo), `resolveVerb` validates
the target's `sdlc.yaml` and `sdlc.local.yaml` (when present), throwing
`OpError('SCHEMA_ERROR', …)` so a stale key fails loudly rather than silently
defaulting. Callers that choose `validate: false` opt out (used internally
when recursing to the `setup` fallback).

**Unknown keys fail validation.** A top-level key the schema does not declare
fails Zod's ordinary unrecognized-key check, the same diagnostic as any typo.
There is no migration shim for earlier shapes; [[D-V2XJ-verb-cascade-and-repo-trust]]
records what moved where.

**The gate rule.** A resolved verb list whose `source` is `local`, `project`
or `default` was read from inside the repository being acted on, and runs
only when that repo is trusted (`sdlc repo trust`) or the caller passes
`--trust` for this run on a command that offers it. The gate asks about the
REPOSITORY owning the root it is handed, not that directory: a linked
worktree and a subdirectory resolve to the main checkout `sdlc repo trust`
grants, so one grant covers every worktree of a repository and the two
surfaces cannot disagree. A command with no `--trust` flag (the ephemeral
commit-worktree arming, which runs unattended) says so — its refusal names
`sdlc repo trust <root>` and nothing else. `env`-sourced verbs — the person's own shell — run
ungated, and so does `source: 'none'` (nothing to gate). Every verb-running
call site checks this immediately before its resolved list executes, never
before resolution; see Trust, below.

## Trust

Some things a tool does to a repository it did not write are code execution
in disguise — running that repository's own scripts, evaluating its build
config. A setting the repository itself can write (`sdlc.yaml`,
`sdlc.local.yaml`) cannot be what authorizes that, because a repository that
can write the setting can grant itself permission. So a person consents
once, per repository, outside the repo, and sdlc remembers the answer.

The consent lives in `$XDG_STATE_HOME/sdlc/trusted/`, or
`~/.local/state/sdlc/trusted/` when unset — deliberately outside the repo
and outside `sdlc.yaml`'s own directory, the way `@sksizer/cli-tool/trust`
(the reusable store this is built on) keys every decision on the absolute,
symlink-resolved repository root. `SDLC_TRUST_STATE=<dir>` relocates the
store outright (tests only; never point it at a real trust directory).

```sh
sdlc repo trust              # trust the repository owning the cwd
sdlc repo trust <path>       # trust the repository owning <path>
sdlc repo trust --list       # every trusted root on this machine
sdlc repo trust --show       # is the resolved root trusted, and its marker path
sdlc repo untrust [<path>]   # revoke a grant
```

`--trust` on a gated command that carries it (`sdlc quality run`, `sdlc pr
review`, `sdlc pr update`) satisfies the gate for that one run without
recording anything — a deliberate one-off, never a standing grant. Commands
without the flag have no per-run bypass at all.

**Layered on top of the fork rule.** `sdlc pr review`'s `pr_review.untrusted`
setting decides FIRST whether a FORK PR's own tree gets its setup verbs run
at all (a stranger's code, reviewed but not installed by default) —
`skip-init`, the default, withholds setup with a warning and never consults
repo trust. Only once that leaves setup verbs to run does the repo-trust
gate ask whether the TARGET repository's own checkout may run them. Both
must pass for setup to run on a fork PR review; `--trust` satisfies both for
one run.

### Policy: trust by path or owner

A machine can pre-trust a whole class of repositories instead of granting
each one by hand. `trust:` lives in the machine config only — never
`sdlc.yaml` — the same rule that keeps marker grants outside the repo: a
repository must not be able to grant itself trust. The policy engine itself —
the glob matcher and its dialect, the `origin`-owner lookup, and the
marker → path → owner precedence — lives in
[`@sksizer/sdlc-tool`](../../../packages/ts/sdlc-tool/README.md), the
repo-aware substrate downstream of cli-tool/easy-git/easy-gh that sdlc
mounts; see that package's README for the glob dialect and the
origin-remote threat model. What follows here is sdlc's own adapter: the
machine-file keys, `~`/`{name}` token expansion, and how `sdlc repo trust
--show`/`untrust`/`project doctor` report a decision.

```yaml
trust:
  paths: ['{dev}/sksizer/**'] # glob over the resolved, symlink-free repo root
  owners: ['sksizer'] # matched case-insensitively against origin's owner
```

Both default to `[]`. A `paths` entry's `~` and `{name}` tokens expand the
same way a `repos:` entry's do, against the machine's own `paths:` — never
the target repo's `sdlc.yaml`, which the repository being judged could
otherwise use to steer its own trust decision.

**Resolution order**: a marker grant (`sdlc repo trust`) wins first, then
`trust.paths`, then `trust.owners` — the first layer that matches decides.
`sdlc repo trust --show` reports which one (`by`) and, for a policy hit, the
matching rule; `sdlc project doctor`'s trust block does too.

**This is written config, not consent.** A marker grant is a one-time,
per-repository decision made by hand, outside any file a dotfiles sync would
carry. A `trust:` policy is a line in a file that DOES travel with a
dotfiles sync — pushing it to a new machine re-grants it there with no
prompt. Write one only as a deliberate standing decision ("every repo I
clone under this directory is trusted"), never as a shortcut past
`sdlc repo trust`.

**The fork rule is unaffected.** `pr_review.untrusted` still decides FIRST
whether a fork PR's own tree runs setup at all, before repo trust — marker
or policy, no difference — is even consulted (see above).

## sdlc.local.yaml

An optional, uncommitted file at `<project-root>/sdlc.local.yaml`, beside
`sdlc.yaml`. Gitignored by `sdlc project setup`. Accepts every key the
project file accepts; deep-merged over the project config BEFORE validation
(mappings merge recursively per key, lists and scalars replace wholesale).

Use it to override one verb without editing the project file:

```yaml
verbs:
  check:
    - just full-check-local
```

The resolver reports `source: 'local'` when the verb came specifically from
this file, not from the underlying project config. The strict-validation
surfaces (`resolveVerb`'s loud path, and the per-op preflight gate) validate
`sdlc.local.yaml` on its own — a read/parse/non-mapping error or an unknown
key fails loudly naming the local file — before also validating the two
merged together. The standalone check matters because `loadConfig`/
`loadConfigLayers` (the tolerant path other callers use) degrade an
unparseable local file to `local: null` and quietly carry on with the
project config alone; validating it separately means that degrade can never
mask a broken override on the loud path.

`sdlc config scaffold --local` renders a commented template of the full
shape.

### `orchestrator:` — in-flight limits for `/sdlc:orchestrate`

The `orchestrator:` block configures the categorized in-flight limits
that `/sdlc:orchestrate` enforces during its dispatch step. Two
limits, two structurally different things:

```yaml
orchestrator:
  max_implementations: 5    # default
  max_awaiting_review: 20   # default
```

- **`max_implementations:`** — hard cap on the count of tasks
  currently in the `implementing` category (status `in-progress`,
  no open PR). When the count is at or above this limit, the
  orchestrator does NOT dispatch any new `/sdlc:task-work`
  sub-agents this tick. This is the only limit that blocks
  dispatch. Default: `5`.
- **`max_awaiting_review:`** — informational ceiling on the count
  of tasks in the `awaiting-review` category (status `in-progress`
  AND an open PR exists for `task/<basename>`). When the count is
  at or above this limit, the orchestrator's digest line records
  `caps-reached=max_awaiting_review` as a warning so the human knows
  the review queue is saturated. **It does NOT block new
  implementations from starting** — awaiting-review tasks have
  already handed control back to the human; they don't consume
  implementation slots. Default: `20`.

A third category — `stale` — surfaces in the digest but never
counts against either limit. Stale = worktree still exists but the
task file's frontmatter is already `closed/...`; the close-out
teardown missed something and the digest is the surface for the
human (or a follow-up tick) to clean it up.

The counter that produces these categories is `sdlc task inflight` —
see its `--help` for the schema of its JSON output. The orchestrator
shells out to it once per tick.

Missing block or missing key both default to `max_implementations: 5`
and `max_awaiting_review: 20`. An empty `orchestrator: {}` block is
treated the same as missing.

#### `orchestrator.review:` — the built-in `pr-review` dispatch

```yaml
orchestrator:
  review:
    engine: claude   # default; or codex
    max_rounds: 3    # default
```

Configures the `prs`/`merges` ticks' (`sdlc orchestrate run`) built-in
`pr-review` workflow dispatch.

- **`engine:`** — engine the `prs`/`merges` ticks dispatch the
  `pr-review` workflow with. Deliberately separate from
  `pr_review.engine` (the interactive `sdlc pr review` engine) so an
  unattended review can run a different model from the one the PR
  author used. Default: `claude`.
- **`max_rounds:`** — cap on review/respond round-trips per PR
  (tracked on the per-PR cursor's `review_rounds` field) before the
  loop stops dispatching `pr-review`/`pr-respond` for that PR and
  fires a `max-rounds` notification instead of looping forever.
  Default: `3`.

Missing block or missing key defaults to both values above. (An
earlier `command` field here backed the OLD `/sdlc:orchestrate`
Step 2a opt-in review phase; that phase and its `get-review-policy` op
were retired when the orchestrate skill was rewritten as a thin
`orchestrate run` wrapper — see [[T-XRFD]].)

### `pr_check:` — comment-filtering for `/sdlc:pr-check` and `orchestrate watch`

```yaml
pr_check:
  author_comments: actionable   # actionable (default, solo) | self-notes (team)
  ignored_authors:              # extra automation bots to filter (optional)
    - vercel
    - dependabot
```

- **`author_comments: actionable`** (default) — review comments and
  submitted reviews authored by the PR author themselves count as
  actionable feedback and can flip `NEEDS-RESPONSE`. This is correct
  for solo-developer repos where the PR author and the reviewer are
  the same human; without it, every comment the author leaves on
  their own PR is silently filtered out and the orchestrator's PR
  triage stays stuck at `CLEAN` forever.
- **`author_comments: self-notes`** — exclude entries whose
  `author.login` matches the PR's `author.login`. This is correct
  for multi-developer teams where author comments on their own PR
  are usually notes-to-self, not actionable feedback waiting on a
  response.
- **`ignored_authors`** — project-specific automation logins whose
  comments and reviews never count as actionable feedback (and never
  wake `orchestrate watch`). This list ADDS to the always-applied
  built-in set; it is the place to silence a project's deploy-preview
  or dependency bots without a plugin release.

**Automation authors are always excluded regardless of `author_comments`.**
The built-in set is `github-actions` and `cloudflare-workers-and-pages`;
`ignored_authors` extends it. Matching is **shape-normalized** — a trailing
`[bot]` suffix is stripped before comparison, so the filter catches both the
suffix-less login `gh pr view --json` (GraphQL) returns (`github-actions`) and
the suffixed login `gh api` (REST) returns (`github-actions[bot]`). An
`ignored_authors` entry may be written in either shape; both match.

Missing block, missing key, or an unrecognised value all default to
`actionable` (and an empty/absent `ignored_authors`). An unrecognised
`author_comments` value also logs a one-line warning to stderr so the
misconfiguration is visible.

The default favours solo workflows because that's the most common
shape today; an explicit setting in `sdlc.yaml` (even when it
matches the default) makes the project's choice auditable rather
than implicit.

### `pr_update:` — scope and strategy for `sdlc pr survey` / `sdlc pr update`

Every key has a default and the whole block is optional, so both verbs
work in a repository with no `sdlc.yaml` at all. Flags override config;
config overrides the built-in defaults.

**Why `rebase` is the default.** A rebase keeps each PR's history linear
and its diff exactly its own commits. That matters most in a stack: a
merge leaves every descendant carrying one merge commit per ancestor
update, and this repository runs stacks seven deep. The usual argument
against — that rewriting outdates review threads — is handled by a guard
rather than by defaulting the whole project to `merge`.

**Why the guards exist.** What a rebase costs is a force-push, and
`--force-with-lease` protects less than it appears to: it compares
against the *remote* ref, so a checkout holding commits nobody has
pushed leaves the lease satisfied and the work destroyed. Hence:

- `unpushed_local:` is checked before everything, `overrides:` included.
  It is a data-safety interlock, not a preference, and there is
  deliberately no way to switch it off. A branch whose state cannot be
  read counts as unsafe.
- `reviewed:` keeps review threads anchored on the one kind of PR where
  a rewrite loses something a human wrote.
- `max_rebase_commits:` bounds replay cost. A rebase re-resolves a
  conflict once per commit; a merge resolves it once. Past some branch
  length that trade stops paying.

`overrides:` is for explicit intent — pinning a protected base to
`merge`, or letting a label opt one PR out. A rule matches when every
field it declares matches, and a rule declaring neither `base:` nor
`label:` is inert rather than a silent global default. Overrides beat
`reviewed:` and `max_rebase_commits:`; they do not beat
`unpushed_local:`.

Guards only ever step down from `rebase`. Nothing in this block turns a
configured `merge` into a rebase.

`lockfile_install:`, `resolvers:` and `verify:` are `sdlc pr update`'s
business — how a conflict is resolved without a human, and what must pass
before the result is pushed.

A conflict in a derived file is not a judgement call: the answer is to re-run
whatever derives it. `resolvers:` is where a project says which globs a verb
owns; `sdlc pr update` runs each matched verb once, whatever number of paths
it claimed, and stages the result. Lockfiles are recognized without
configuration, but re-deriving one needs a command only the project knows, so
`lockfile_install:` supplies it — without one, a lockfile conflict is left for
a human rather than resolved to a file that disagrees with its own manifest.

A conflicted path nothing claims ends that PR's update and the run moves on.
Guessing at a source file would be worse than reporting it.

`sdlc pr update --interactive` shows the same plan as a checklist and runs
only the rows you tick — the per-PR call is the one a person actually wants
to make. Rows the guards refused are shown, greyed, with their reason, and
cannot be ticked; a keystroke is not an argument against a safety guard.

`verify:` defaults to `none`: the deterministic tier only ever produces a
merge git resolved itself or an artifact a generator rebuilt, and running a
project's whole gate once per PR does not scale across a fifty-PR run — CI on
the PR is the real gate. Set `check` where a bad push is expensive.

`verify: check` resolves and runs `verbs.check` (via `resolveVerb`) exactly
like `sdlc quality run` — a project-sourced verb list, so it is trust-gated
the same way (see Trust, above): the repository must be trusted (`sdlc repo
trust`) or the run must pass `sdlc pr update --trust`, or it exits
`UNTRUSTED` before touching any PR.

Scope is the repository at `--project-root` unless `--repo owner/name` names others; those are found
through the top-level [`repos:`](#repos--where-other-repositories-live-on-this-machine) containers.
Drift and conflict prediction read git objects, so a repository named with `--repo` but with no
checkout on this machine is reported as unmeasurable rather than guessed at.

### `task.execution.spawn_from_post_mortem:` — how `/sdlc:task-work` spawns follow-ups

```yaml
task:
  execution:
    spawn_from_post_mortem:
      enabled: true                    # default true
      drive_to_ready: true             # default true
      fallback_status: planning/draft  # default planning/draft
```

Governs the Step 8 post-mortem → follow-up-task flow
(`/sdlc:spawn-from-post-mortem` → `/sdlc:spawn-task-pr`). Read once per
`/sdlc:task-work` run via `sdlc config get-spawn-policy`.

- **`enabled`** — whether Step 8 spawns follow-up tasks at all. `false`
  skips the spawn sub-step entirely (the post-mortem is still written and
  committed); Step 8 emits a `SPAWN-DISABLED:` no-op line and moves on. Use
  it to turn off automatic follow-up generation for a project that triages
  friction by hand.
- **`drive_to_ready`** — whether each spawned follow-up is best-effort driven
  to `open/ready` before its PR opens. `true` runs
  `/sdlc:task-auto-define --set-ready true` then `/sdlc:task-ensure-ready` on
  the scaffolded task: when the spec can be synthesized from the friction
  bullet plus codebase context AND passes the readiness gate, the task lands
  `open/ready` with `readiness_verified_at:` stamped and carries an
  `AUTO-DEFINED:` review note. When it can't, the task lands at
  `fallback_status`. The drive is best-effort — it never fabricates a spec
  and never fails the spawn.
- **`fallback_status`** — the `planning/*` status a follow-up lands at when it
  is NOT driven to ready (either `drive_to_ready: false`, or the drive
  couldn't produce a ready spec). Must be a non-ready planning status
  (`planning/draft`, `planning/needs-definition`, `planning/proposed`,
  `planning/backlog`); default `planning/draft`. Set
  `planning/needs-definition` to route undriveable follow-ups straight into
  the definition backlog.

Missing block or missing keys default to `enabled: true`,
`drive_to_ready: true`, `fallback_status: planning/draft`. A `drive_to_ready`
pass costs an LLM auto-define per spawned follow-up, so a project that spawns
many follow-ups and prefers hand-authored specs can set `drive_to_ready: false`.

#### `target:` — which PR a spawned follow-up lands in, and its title

```yaml
task:
  execution:
    spawn_from_post_mortem:
      target:
        pr_grouping: per-task        # per-task | per-execution | per-project
        pr_title_pattern: null       # optional; null = each mode's default title
```

Controls how spawned follow-ups are packaged into PRs. **Grouping is per
target repo** — classification routes `Local` / `Upstream-plugin` /
`Cross-project-request` follow-ups to different repos, and a PR cannot span
repos, so the modes below bundle *within each target repo*.

- **`pr_grouping: per-task`** (default) — one PR per spawned task, on
  `meta-task/<slug>`. Today's behavior; each gap is independently reviewable.
- **`pr_grouping: per-execution`** — one PR per `/sdlc:task-work` run,
  bundling all that run's follow-ups for a repo onto
  `meta-task/followups-<originating-task>`. Fewer PRs; the reviewer takes the
  batch together.
- **`pr_grouping: per-project`** — a single rolling PR per repo on
  `meta-task/spawn-followups` that accumulates follow-ups across runs (append
  to the open PR, or start a fresh one — the `sdlc backlog create` rolling
  pattern). Lowest PR churn; the PR can grow large between merges.
- **`pr_title_pattern`** — optional template for the PR title, resolved at
  PR-creation time. Placeholders (unknown → empty): `{headline}`, `{slug}`,
  `{originating_task}`, `{classification}`, `{date}` (UTC), `{repo}`
  (owner/name). `null` (default) → each mode's built-in title: `per-task` uses
  the task headline (today's behavior), `per-execution` uses
  `chore(tasks): follow-ups from {originating_task}`, `per-project` uses
  `chore(tasks): spawned follow-up tasks`. `{slug}` / `{classification}` are
  meaningful only for `per-task`; for shared modes they resolve to the first
  task in the PR, so prefer run-level tokens there.

The `spawn-task-pr` sub-skill stays a pure mechanism (`--branch` +
`--pr open|rolling` + `--pr-title`); `spawn-from-post-mortem` maps this config
onto those flags per target-repo group.

### `backlog.capture:` — how `sdlc backlog create` submits captured items

```yaml
backlog:
  capture:
    enabled: true                    # auto-open/update a PR (vs. author locally)
    target:
      pr_grouping: per-project       # per-project (rolling) | per-item
      pr_title_pattern: null         # optional; null = mode default
```

Governs the deterministic tail behind `/sdlc:backlog-capture`
(`sdlc backlog create`). Read via `sdlc config get-backlog-policy`.

- **`enabled`** — whether capture auto-submits to a PR. `true` (default)
  authors the item, commits it in an ephemeral worktree, pushes, and
  opens-or-updates a PR (today's behavior; prints `PR: <url>`). `false`
  authors the file in the working tree and stops — no commit, push, or PR
  (prints `WROTE: <path>`). Use it to capture locally and submit by hand.
- **`pr_grouping`** — `per-project` (default) is a single rolling
  `backlog-capture` PR that accumulates every captured item until triaged;
  `per-item` opens one branch/PR per item (`backlog/<slug>`). (No
  `per-execution` — backlog capture has no run to bundle, unlike spawn.)
- **`pr_title_pattern`** — optional title template, resolved at PR-creation
  time. Placeholders (unknown → empty): `{id}` (B-NNNN), `{slug}`, `{title}`
  (headline), `{date}` (UTC). `null` → each mode's default: `per-project` =
  `docs(backlog): rolling capture`; `per-item` = `docs(backlog): {title}`. A
  rolling PR's title is fixed by the item that first opened it.

Missing block or missing keys default to `enabled: true`,
`pr_grouping: per-project` — today's rolling-capture behavior.

### `paths:` — named directories the other path settings refer to

```yaml
paths:
  dev: ~/Developer
  work: /srv/work
```

A map of name → directory. Any path-valued setting that accepts tokens can
say `{name}` instead of spelling the directory again: today that is each
`repos:` entry and `checkout.layout`. So `dev` declared once gives
`repos: ['{dev}', '{dev}/work']` and `layout: '{dev}/{owner}/{repo}'`.

A name is letters, digits and `_`, starting with a letter, and cannot be
`host`, `owner` or `repo` — those are the layout's own tokens. A value
expands `~` and resolves a relative path against the project root. Entries
do not refer to each other. A `{name}` that nothing defines is an error
naming the setting it appeared in and the fix, never an empty string.

Directories are facts about a machine, so this map is the natural home for
the **machine-level config** (below): put `dev` there once and every
project's `sdlc.yaml` can refer to it. A project may still declare a name
for a path its own docs assume (`checkouts: ./checkouts`, say); the machine's
entry of the same name wins.

### `repos:` — where other repositories live on this machine

```yaml
repos:
  - '{dev}'              # a directory that CONTAINS checkouts, at any depth
  - ~/work/api           # a single checkout
  - /srv/repos
```

Used whenever a verb has to work on a repository other than the one it runs
in: `sdlc pr review <url>` to find the review target, `sdlc pr survey --repo
owner/name` to find the checkout its drift is measured in, `sdlc repo
checkout` to notice a clone that is already on disk, `sdlc project cleanup
--all` to know what to sweep. An entry may use `{paths}` tokens; `~` expands
and a relative path resolves against the project root, as for every other
path value.

What an entry names is read off the disk, not off how it is written:

| Entry | Detected by | Names |
| --- | --- | --- |
| `~/work/api` | it is itself a checkout | that repository |
| `~/Developer` | it is a directory that is not a checkout | every checkout under it |

The search descends through directories that are not checkouts and stops at
the ones that are, so `~/Developer/acme/api` is found and nothing inside a
repository — a vendored tree, a parked worktree — is walked into. A linked
worktree collapses into the repository it belongs to, so a directory holding
a checkout and its worktrees names one repository, not several.

**The list never puts a repository in scope by itself.** Listing `~/Developer`
says where checkouts live. A verb that can work across repositories does so
only when asked — `sdlc project cleanup --all`, `sdlc pr survey --repo` — and
every other invocation stays in the repository you are standing in.

Paths like these describe a machine, not a project, so the same key also
lives in the **machine-level config** — see below — and that list is searched
first. Keep the committed `repos:` for entries that hold on every clone (a
sibling directory the project's own docs assume, say) and put personal paths
in the machine file.

### `checkout:` — where `sdlc repo checkout` puts a clone

```yaml
checkout:
  layout: '{dev}/{owner}/{repo}'   # default: '{dev}/{repo}'
  protocol: https                  # https | ssh
```

`sdlc repo checkout <url>` takes anything that names a hosted repository — a
clone URL, the page of a pull request or a file, a bare `owner/repo` — and
puts a checkout of it where `layout` says.

- **`layout`** — a path template. Its tokens are the repository's own —
  `{host}` (`github.com`), `{owner}`, `{repo}` — plus every `paths:` name.
  The default `{dev}/{repo}` needs a `dev` path and keeps every checkout
  directly under it. A grouped layout such as `{dev}/{owner}/{repo}` works
  the same way: `repos: ['{dev}']` finds both, because the scan descends
  through directories that are not checkouts. A token nothing defines is an error, not an
  empty string. `~` expands and a relative result resolves against the
  project root. `--dest <dir>` skips the layout for one run.
- **`protocol`** — the clone URL built for an input that does not carry one
  (`owner/repo`, `github:owner/repo`). An explicit `https://…` or `git@…:`
  input is cloned the way it was given.

A checkout that already exists is reported, not cloned twice: one at the
planned path, or — when no `--dest` pinned the place — one found under the
`repos:` containers. `--branch` picks the branch; a URL that names one
(`/tree/<branch>`, `#v1.0`) is honoured without it. `--print-path` prints
only the path, which is what the `sdlc-repo-checkout` shell function `cd`s
to (see `solutions/ontological/cli/README.md`, "Shell integration").

Both keys also live in the machine-level config (below), where each one set
wins over the project's.

### `host:` — where sdlc puts work in front of you

```yaml
host:
  default: terminal       # terminal | orca | cmux
```

The default host for every feature that opens something for a person — an
agent session, a command in a terminal. `terminal` runs it in the current
terminal and returns when it ends; `orca` opens a terminal tab in the Orca
app; `cmux` opens a cmux workspace. A feature's own key (`pr_review.host`)
overrides this, and a `--host` flag overrides both. Hosts fulfil a contract
in parts; a feature that needs a part the host lacks fails rather than
falling back. See `solutions/ontological/conventions/host.md`.

### `pr_review:` — how `sdlc pr review` opens a session

```yaml
pr_review:
  engine: claude          # claude | codex
  host: orca              # optional; absent → host.default
  untrusted: skip-init    # skip-init | full | refuse
  setup: true             # run setup on every launch; --no-setup skips it
  prompt:
    mode: extend          # extend | replace
    text: |
      Also check that every PR mention is hyperlinked.
```

- **`engine`** — the interactive agent started in the PR's worktree, with the
  review brief as its first message. `--engine` overrides per run.
- **`host`** — where the session opens when it should differ from
  `host.default` (see above). `--host` overrides per run.
- **`setup`** (default `true`) — whether the `setup` verb runs in the PR
  worktree before every launch, created or reused alike. Idempotency is the
  verb's own contract, so re-running it on a reused worktree is cheap by
  design; there is no "did it already run" bookkeeping. `--no-setup` skips it
  for one run; `setup: false` skips it for every run. Still gated by
  `untrusted` (below) and by repo-store trust
  ([[D-V2XJ-verb-cascade-and-repo-trust]]).
- **`untrusted`** — what setup does with a fork PR, whose tree is a
  stranger's code. Three things are true of any PR checkout and only matter
  when the author is not trusted. The setup verb runs with that tree as cwd,
  so an install executes the PR's own package lifecycle scripts before
  anyone has read them. The agent starts inside the tree, so the branch's
  `CLAUDE.md`, `.claude/settings.json` hooks and MCP config are the author's.
  And the brief embeds the PR title while the agent reads the body and
  comments on request, so the text is a prompt-injection surface — which is
  why the brief tells the agent to post nothing and change nothing.
  `skip-init` (default) closes the first: the worktree is created, setup is
  withheld, and a warning names the second. `full` treats the PR like a
  colleague's. `refuse` exits with an error. `--trust` runs one PR as `full`.
  Same-repo PRs are never affected.
- **`prompt`** — the brief. `extend` (default) appends `text` after the
  built-in brief; `replace` uses `text` as the whole prompt. Both resolve the
  placeholders `{pr_number}`, `{pr_url}`, `{pr_title}`, `{pr_author}`,
  `{base}`, `{head}`, `{repo}`, `{worktree}` and `{default_prompt}` (unknown
  ones render empty), so a replacement can embed the built-in brief wherever
  it likes. The built-in brief is `DEFAULT_REVIEW_PROMPT` in
  `solutions/ontological/lib/services/pr/review/prompt.ts`.

Missing block defaults to `claude` in the current terminal with the built-in
brief.

## Machine-level config

`<config-home>/sdlc/config.yaml` — `~/Library/Application Support/sdlc/config.yaml`
on macOS, `$XDG_CONFIG_HOME/sdlc/config.yaml` (default `~/.config/sdlc/`)
elsewhere; the same directory `sdlc dev use` writes its `home` redirect into —
is `sdlc.yaml`'s twin for values that describe THIS machine rather than a
project. It is never committed.

```yaml
paths:
  dev: ~/Developer
repos:
  - '{dev}'
checkout:
  layout: '{dev}/{owner}/{repo}'
```

Every key it carries also exists in `sdlc.yaml`, and the two files are read
together. How they combine depends on the key's shape, and the rule is the
same for every key of that shape:

| Shape | Keys | Rule |
|---|---|---|
| list | `repos` | concatenated, machine entries first, duplicates dropped |
| map | `paths` | merged per name; the machine's entry wins |
| scalar | `checkout.layout`, `checkout.protocol` | the machine's value wins when set; the project's default applies otherwise |
| map | `trust` | machine only — no `sdlc.yaml` counterpart; a repository cannot grant itself trust (see [Policy: trust by path or owner](#policy-trust-by-path-or-owner)) |

The machine file is optional everywhere: with no machine file at all, the
project's `sdlc.yaml` alone decides. A `~` or relative path in the machine
file expands the same way as in `sdlc.yaml` (relative against the project
root). Keep the committed `sdlc.yaml` for entries that hold on every clone
and put personal directories in the machine file.

Shape and loader: `MachineConfigSchema` in
`solutions/ontological/lib/config/machine.ts`, read by `@sksizer/cli-tool/config`'s
`machineConfigFile` with the same never-throws, defaults-on-failure contract
as `loadConfig`. The merge rules live where each
key is consumed — `repoContainers` (`repos`), `pathTokens` (`paths`),
`checkoutSettings` (`checkout`) — so the table above is documentation of
those three functions, not a fourth mechanism. `SDLC_MACHINE_CONFIG=<path>`
relocates the file for one run.

## Consumers

All in-process consumers read config via `ctx.sdlcConfig` (set by
`createCtx` → `loadConfig`). **Do not add new ad-hoc `sdlc.yaml` reads;**
use `ctx.sdlcConfig` instead.

- **`ctx.sdlcConfig`** (`solutions/ontological/lib/registry.ts`) — the op-context field
  hydrated once per CLI invocation by `createCtx` via `loadConfig`. Every
  op handler reads config from here.
- **`solutions/ontological/lib/model/entities/task/ops/inflight.ts`** — reads
  `ctx.sdlcConfig.orchestrator.max_implementations` and
  `ctx.sdlcConfig.orchestrator.max_awaiting_review` for the dispatch caps.
- **`solutions/ontological/lib/services/orchestrator/ticks/prs.ts`** /
  **`_pr_action.ts`** — read `ctx.sdlcConfig.orchestrator.review.max_rounds`
  to cap `pr-review`/`pr-respond` round-trips per PR.
- **`solutions/ontological/lib/services/orchestrator/step-runner.ts`** —
  reads `ctx.sdlcConfig.orchestrator.review.engine` (falling back from
  `orchestrator.workflows.<name>.engine`) to pick the `pr-review`
  workflow's dispatch engine.
- **`solutions/ontological/lib/services/pr/ops/review.ts`** — reads
  `ctx.sdlcConfig.pr_review` for the engine, host and prompt, and
  `loadConfig(<target-repo>).repos` + `loadMachineConfig().repos` (via
  `repoContainers` in `lib/services/repo/locate.ts`) to find another
  repository's checkout.
- **`solutions/ontological/lib/services/repo/ops/checkout.ts`** — reads the
  `checkout:` block and the `paths:` map of both files (via
  `lib/services/repo/layout.ts` `checkoutSettings`) for the layout, protocol
  and tokens, and scans the `repos:` containers (via `repoContainers` /
  `locateRepo`) before cloning.
- **`solutions/ontological/lib/services/pr/ops/classify.ts`** — reads
  `ctx.sdlcConfig.pr_check.author_comments` to decide whether the PR
  author's own comments are actionable or self-notes.
- **`solutions/ontological/lib/services/pr/ops/survey.ts`** — reads
  `ctx.sdlcConfig.pr_update` for scope (`author`, `include_drafts`), the
  top-level `repos:` containers (via `repoContainers` / `locateRepo`) to
  locate a `--repo` target, and hands the strategy block to
  `lib/services/pr/strategy.ts#chooseStrategy`, which decides rebase vs
  merge vs skip per PR.
- **`solutions/ontological/lib/services/pr/ops/update.ts`** — plans from
  `runSurvey` (the same call, never a second implementation) and reads
  `pr_update.lockfile_install`, `pr_update.resolvers` and `pr_update.verify`
  for the conflict-resolver ladder and the pre-push gate; `verify: check`
  calls `resolveVerb('check', targetRepo)` to run the check verbs.
- **`solutions/ontological/lib/services/lease/runtime.ts`** — calls `lowReadLeaseAuthority`
  (from `@lib/config/load.ts`) as the raw YAML read inside its
  `readAuthorityFromSdlcYaml` dedup point. The env-override / throw-on-unset
  wrapper in `resolveAuthority` is unchanged.
- **`solutions/ontological/lib/config/sdlc_yaml.ts`** (`validateFile`) —
  the strict validation surface. Validates via `SdlcConfigSchema`
  `.safeParse` and surfaces each Zod issue as an `at <location>:
  <message>` diagnostic line.
- **`solutions/ontological/lib/services/config/ops/{get,set}-verbs.ts`** —
  YAML-Document **read/write** paths for named verbs. `get-verbs --name
  <verb>` retrieves the verb list; `set-verbs --name <verb> <cmd1> <cmd2> …`
  writes it. These use the `yaml` Document API for comment/sibling
  preservation and are out of scope for the typed hydration path.
- **`sdlc quality run`** (`solutions/ontological/lib/services/quality/ops/run.ts`) — executor.
  Resolves a verb name via `resolveVerb(name, projectRoot)` where name
  defaults to `check`, and runs each verb. Also accepts `--baseline-dir
  <path>` and `--diff-against-baseline <sha>`.
- **`solutions/ontological/lib/services/git/arm-worktree.ts`** — resolves
  `setup-hooks` for ephemeral commit-worktrees via `resolveVerb`, with trust
  gating and progress output.
- **`solutions/ontological/lib/services/project/ops/detect-setup.ts`** —
  probes the repo with `detect-runners#collect` for the implicit `setup`
  default heuristic (part of `resolveVerb`'s default layer).
- **`solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md`** Steps 4 and 7 — call
  `resolveVerb('setup', worktreeRoot)` (Step 4) and `resolveVerb('check',
  repoRoot)` (Step 7) via `sdlc quality run --name check`.
- **`solutions/ontological/plugin/plugins/sdlc/skills/orchestrate/orchestrate.md`** — a thin wrapper
  around `sdlc orchestrate run --once`, which reads the whole
  `orchestrator:` block (`loops`, `interval_seconds`, `review.max_rounds`,
  `pr_filters`, `notify`) — see the `orchestrate run` op
  (`lib/services/orchestrator/ops/run.ts`) and its ticks
  (`lib/services/orchestrator/ticks/`) for where each field is read.
- **`sdlc project setup`** (called by `/sdlc:setup`) — creates an empty
  `sdlc.yaml` when absent; creates an empty gitignored `sdlc.local.yaml`
  template. Idempotent: existing files are left untouched.

## Editing

`sdlc.yaml` is human-authored YAML. Two paths to populate verbs:

1. **Interactively:** run `/sdlc:find-verbs --name check` (or `--name setup` /
   `--name setup-hooks`). The skill probes the project, presents detected
   runners via `AskUserQuestion`, and writes the approved subset via
   `sdlc config set-verbs --name <verb>`.
2. **By hand:** edit the file directly. Any YAML editor works; the shape is
   documented by `SdlcConfigSchema` in `solutions/ontological/lib/config/load.ts`.
   Re-running `/sdlc:find-verbs --name check` later is safe — it reads the
   existing list, merges the new selection, and writes back.

A hand-edited file is validated against `SdlcConfigSchema` whenever an sdlc
command runs: the CLI's preflight (`solutions/ontological/lib/preflight.ts`)
refuses to run any op while the file fails the schema, printing each Zod
issue as an `at <location>: <message>` line. Inside the library `loadConfig`
still degrades a schema-invalid document to the all-defaults object, so
in-process callers never throw on config; the CLI is where a person gets
told. The `verbs:` names are validated through the same schema every time a
tool resolves them, so a malformed verb list surfaces at that point.

## Why not under `entities/`?

`solutions/ontological/lib/model/entities/<type>/` holds planning artifacts — things with stages,
lifecycles, and frontmatter that the validator gates on. `sdlc.yaml` is
operational configuration: no stages, no lifecycle, no required fields.
Its schema is the Zod `SdlcConfigSchema` in `solutions/ontological/lib/config/`, not a
`solutions/ontological/lib/model/entities/sdlc-yaml/schema.json` — so the entity-audit /
entity-migrate machinery (which walks `solutions/ontological/lib/model/entities/*/`) does
not treat `sdlc.yaml` as an entity.
