# Hosts — where sdlc puts work in front of a person

A **host** is somewhere on this machine that can show a person their work:
the terminal they are in, a tab in a terminal app, a workspace in a
multiplexer. The contract lives in
`solutions/ontological/lib/services/host/contract.ts`; the implementations
sit one file each under `lib/services/host/hosts/`.

## Host and harness are independent axes

**Host** (`HostName`: `terminal` | `orca` | `cmux` | `tmux`) answers WHERE a
session runs. **Harness** (`Harness`, `lib/services/host/harness.ts`:
`claude` | `codex` | `cursor` | `pi`) answers WHICH coding-agent CLI runs
there. Every host is a WRAPPER: it opens a terminal/workspace and runs
`harnessArgv(req.harness, req.prompt)` (`harness.ts`) in it, so any host can
open any harness — the two vary independently, never a fixed pairing.

This was briefly not true: Phase 6 collapsed the two axes by making
`claude`/`codex`/`cursor` `HostName` values too, each hardcoding its own CLI
and ignoring the requested harness entirely. That collapse is undone: a
config field or CLI flag that names WHERE (`host:`) validates against
`HostNameSchema`, and one that names WHICH agent (`engine:`) validates
against `HarnessSchema` — the two are never interchangeable, and neither
input accepts the other's values as an alias.

## The contract is fulfilled in parts

| Part | Request | What it does |
|---|---|---|
| `session` | `{cwd, harness, prompt, title}` | Open an interactive coding-agent session running `harness`, with `prompt` as its first message; returns `{exitCode, harnessSessionId}` |
| `terminal` | `{cwd, argv, title}` | Run `argv` in a terminal the person can see; returns the exit code |
| `send` | `{cwd, text}` | Deliver `text` into a session that is ALREADY OPEN at `cwd`; returns `{accepted, deliveryKnown}` |
| `find` | `{cwd}` | List live-or-dead sessions at `cwd`, for reconciliation; returns `FoundSession[]` |
| `focus` | `{cwd}` | Bring the live session at `cwd` forward; returns `false` when there is none or the host call failed |

Every part is optional on a host — a consumer asks for the one it needs with
`requirePart(host, 'session')` and gets `HostPartMissing` when the host lacks
it. There is no fallback to another host: the person chose this one, and a
session quietly opening somewhere else is worse than an error. `terminal`
returns the exit code to report — the process's own when the host waits on
it, `0` when it hands off to its own managed window. `session` returns that
same exit code alongside `harnessSessionId`: the host's own identifier for the
session it just started, best-effort and harness-dependent (`wrapperSession`
in `harness.ts`), `null` when none was determined — `sdlc session
list`/`session attach` ([[T-QMGC]]) look a launch back up by it. `available()`
says whether the host's binary or app is on this machine.

## Hosts today

| Name | Mechanism |
|---|---|
| `terminal` | Spawns in place with inherited stdio — the one sanctioned raw spawn, marked `@sdlc:ignore-spawn`. Always waits (`hostWaits`, `session/ops/launch.ts`): it IS the current terminal. No `send`/`find`/`focus`. |
| `orca` | `orca terminal create --worktree path:<cwd> --command …`; registers the repo and retries once on a miss. Hands off and returns once creation succeeds. Fulfils `send` (`orca terminal send`), `find`, and `focus` (`orca terminal switch`). |
| `cmux` | `cmux workspace create --cwd <cwd> --command …`. Hands off the same way. No `send`/`find`/`focus` yet. |
| `tmux` | `tmux new-session -d -s <name> -c <cwd> -- <argv>`, detached; session name derived deterministically from `cwd` (`tmuxSessionName`, a hash — tmux names must be unique server-wide). Fulfils `send` (two `send-keys` calls: literal text, then `Enter`), `find` (`has-session`, alive/dead only — no harness identity, no output-recency signal), and `focus` (`switch-client`, only when run inside tmux). |

Adding a host is one file under `hosts/`, a name in `HOST_NAMES`
(`HostNameSchema` derives from it — the one schema every `host:`-shaped
config field and CLI flag validates against), and an entry in
`hostRegistry()`; a host that cannot run arbitrary commands simply leaves
`terminal` undefined.

## The harness axis

`Harness` (`claude` | `codex` | `cursor` | `pi`) is pure argv-building and
naming, independent of any host: `harnessArgv(harness, prompt)` returns the
bare CLI with `prompt` as its first message, guarded behind a `--`
end-of-options marker for every binary. `harnessAvailable(harness)` probes
its binary on PATH — checked before every interactive launch
(`startSession`, `session/start.ts`), so a hands-off host never
opens a pane whose command dies immediately. A harness has no default host of
its own; `host.default` (or a feature's own `host` key) picks the host,
always.

Per-harness native message injection (`harnessNativeSend`, distinct from a
host's own `send` part) reaches the harness's process/daemon directly when
one exists — today only `codex`, via `codex queue --thread <id> --message
<text>`.

## Session records, list and attach

Every `sdlc session launch` — headless or interactive, whichever host it
opened on — writes one `SessionRecord` to `.sdlc/sessions/<id>/record.json`
under the project root (`lib/services/session/record.ts`). There is one
record location for every host, not one per host. A record carries `host`
(`null` for headless), `engine` (the harness), `harnessSessionId`, `cwd`,
`launched`, `startedAt`, `endedAt`, `exitCode`, and `logPath` (`null` for
interactive — its output is never captured).

- **`sdlc session list [--host <name>]`** — reads every record under
  `.sdlc/sessions/`, skips one that fails to parse, and prints a table
  (most-recently-started first) or `(no sessions)` when empty.
- **`sdlc session attach <id>`** — looks the record up by id and dispatches
  on `host` first, then — for any real host — on `engine` (harness): resume
  is ENGINE-native and host-independent, so the same harness-keyed branches
  apply regardless of which host actually opened the session (`claude
  attach <id>`, `codex resume <id>` — or best-effort `codex resume --last`
  without one — `cursor-agent --resume=<id>`, the `=`-bound form; `pi` has no
  session-id resolver yet, so it always prints a how-to). `host === null`
  (headless) prints where the captured log landed instead. That resume spawn
  is a raw, blocking, `stdio: "inherit"` child — the same exception as
  `terminal`'s spawn above.
- **`sdlc session focus <target>`** — resolves a task id, PR number or URL,
  or branch to a branch, finds that branch's session record, and calls the
  host's `focus`. When the host has no `focus` part or it returns `false`,
  it exits non-zero and prints `sdlc session attach <id>` (plus `tmux
  attach-session -t <name>` for tmux).

## Session state

A session's state lives on its `SessionRecord` (`lib/services/session/record.ts`),
the projection of its event log (`lib/services/session/events.ts`): `starting` |
`running` | `waiting_for_input` | `idle` | `ended`. There is no second,
per-lease record. `lib/services/session/hook-status.ts` maps a harness's own
hook payload (`claudeHookStatus` for Claude) onto that vocabulary, but nothing
in production appends hook events yet, so a hands-off session reads `running`
until the hook step of [[N-70QE-sessions]] lands. `session list`'s `state`
column is the record's state.

## Registering a live session for the Router

The orchestrator's Router (`lib/services/dispatch/router.ts`) has a `live`
delivery route: send fresh PR feedback straight into a session that is
already open, instead of a cold `pr-respond` dispatch. It finds that session
by branch — `dispatch/session-lookup.ts`'s `findSessionForBranch` resolves
the PR's head branch to the `SessionRecord` whose `branch` field matches
(preferring one still running, `endedAt === null`), and `attemptLive`
(`router.ts`) only actually sends into it when that record also carries a
non-null `host` with a `send` part. `SessionRecord` is the ONLY thing this lookup reads.

A human registers a live session for a PR by running `sdlc session launch`
from the PROJECT ROOT the orchestrator itself uses (the main checkout — NOT
`cd`ed into the task worktree), naming the worktree with `--cwd`:

```sh
sdlc session launch --host tmux --engine claude --cwd <task-worktree>
```

This matters because `resolveProjectRoot` (`@lib/config`) picks the nearest
ancestor directory that has its own `sdlc.yaml` — and a worktree, being a
checkout of the same repo, has one too. Run the launch command from INSIDE
the worktree instead (`cd <task-worktree> && sdlc session launch ...`, or
`--cwd .`), and the `SessionRecord` lands under
`<task-worktree>/.sdlc/sessions/`, not `<main-checkout>/.sdlc/sessions/` —
exactly where an orchestrator running from the main checkout never looks.
`findSessionForBranch` then simply finds nothing, so `live` always falls
through to `resume`/`fresh`: it fails SAFE, but silently — no error, no log
line, just a route that never gets tried.

Run that way, the single command is sufficient — no extra registration step
exists or is needed. `tmux` is a
hands-off host (`hostWaits('tmux') === false`, `session/ops/launch.ts`), so
the launch writes `SessionRecord.host: 'tmux'` and `endedAt: null`
immediately, and `branch` from the worktree's checked-out branch — exactly
the shape `findSessionForBranch`/`attemptLive` need, with zero duplication
between "what launch writes" and "what the Router reads." `orca` works the
same way (also hands-off, also fulfils `send`); `terminal` never can
(`hostWaits('terminal') === true` — the session has already ended, by
definition, once the launch command returns) and `cmux` has no `send` part
yet, so a `live` delivery to either always falls through to `resume`/`fresh`.

Two config flags gate this end to end: `orchestrator.router.enabled` (route
`prs`/`merges` feedback through the Router at all — default true) and
`orchestrator.router.live_enabled` (allow the `prs`/`merges` loop to
*attempt* `live` on its own — default **false**, since it is unverified
end-to-end against a real hosted session). An explicit
`sdlc pr route <n> --route live` attempts the route regardless of
`live_enabled` — that is a single manual op confirming the route works from
the pane, which is how `live_enabled` gets earned in the first place; the
loop's own automatic dispatch still respects the flag. Set `host.default:
tmux` to make `sdlc session launch` open tmux sessions by default, without a
`--host` flag on every invocation.

### Known limitations of the `live` route

- **No fallback after a send.** A host's `send` never confirms delivery the
  way a completed `resume`/`fresh` run does — `accepted` alone (no
  `deliveryKnown`) maps to `'unconfirmed'`, which the Router still counts as
  `won` (`dispatch/router.ts`). Once the send itself exits 0, the chain
  stops; there is no automatic fallback to `resume`/`fresh` for a message
  that was pasted but never actually read.
- **Stale records look live.** A hands-off host's `SessionRecord` never gets `endedAt`
  after launch (see "Session state" above — the record is a
  launch-time snapshot, not live status), so a tmux pane a human closed by
  hand, or a machine that rebooted, still resolves as a running session to
  `findSessionForBranch`.
- **The target is chosen by `cwd`, not by branch.** `tmux`'s `send` targets
  the session named by a hash of the record's `cwd` (`tmuxSessionName`). If
  a worktree is later reused for a different branch and relaunched, delivery
  for the ORIGINAL branch's PR can land in that other session instead —
  `findSessionForBranch` resolves the branch to a `SessionRecord`, but the
  record's `cwd` is what `send` actually addresses.
- **Paste-plus-Enter is unconditional.** It lands in whatever state the pane
  is in: a human mid-prompt, or a pending permission dialog where Enter
  confirms whichever option is currently highlighted — there is no check
  that the pane is idle and ready for a new prompt before sending.

## Choosing a host

`pickHost(config, requested, featureSetting)` applies the one precedence rule
every consumer shares: an explicit request (e.g. `--host`), else the
feature's own key (`pr_review.host`, `workflows.<name>.host`), else
`host.default` in `sdlc.yaml`. Engine/harness follows the identical shape,
independently: `--engine`, else the feature's own key (`pr_review.engine`,
`workflows.<name>.engine`), else a hardcoded default (`'claude'`).

## Consumers

- `sdlc pr review` — `session` in the PR's worktree.
- `sdlc session launch` — `session` (or headless spawn), on the host
  `pickHost` resolves (`--host`, else `workflows.<name>.host` for a
  `--workflow` launch, else `host.default`), running the harness `--engine`/
  `workflows.<name>.engine`/`pr_review.engine` resolves; writes the
  `SessionRecord` `session list`/`session attach` read.
