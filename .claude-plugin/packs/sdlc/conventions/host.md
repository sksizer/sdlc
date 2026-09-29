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
| `session` | `{cwd, harness, prompt, title}` | Open an interactive coding-agent session running `harness`, with `prompt` as its first message; returns `{exitCode, hostSessionId}` |
| `terminal` | `{cwd, argv, title}` | Run `argv` in a terminal the person can see; returns the exit code |
| `send` | `{cwd, text}` | Deliver `text` into a session that is ALREADY OPEN at `cwd`; returns `{accepted, deliveryKnown}` |
| `find` | `{cwd}` | List live-or-dead sessions at `cwd`, for reconciliation; returns `FoundSession[]` |

Every part is optional on a host — a consumer asks for the one it needs with
`requirePart(host, 'session')` and gets `HostPartMissing` when the host lacks
it. There is no fallback to another host: the person chose this one, and a
session quietly opening somewhere else is worse than an error. `terminal`
returns the exit code to report — the process's own when the host waits on
it, `0` when it hands off to its own managed window. `session` returns that
same exit code alongside `hostSessionId`: the host's own identifier for the
session it just started, best-effort and harness-dependent (`wrapperSession`
in `harness.ts`), `null` when none was determined — `sdlc session
list`/`session attach` ([[T-QMGC]]) look a launch back up by it. `available()`
says whether the host's binary or app is on this machine.

## Hosts today

| Name | Mechanism |
|---|---|
| `terminal` | Spawns in place with inherited stdio — the one sanctioned raw spawn, marked `@sdlc:ignore-spawn`. Always waits (`hostWaits`, `session/ops/launch.ts`): it IS the current terminal. No `send`/`find`. |
| `orca` | `orca terminal create --worktree path:<cwd> --command …`; registers the repo and retries once on a miss. Hands off and returns once creation succeeds. Fulfils `send` (`orca terminal send`) and `find`. |
| `cmux` | `cmux workspace create --cwd <cwd> --command …`. Hands off the same way. No `send`/`find` yet. |
| `tmux` | `tmux new-session -d -s <name> -c <cwd> -- <argv>`, detached; session name derived deterministically from `cwd` (`tmuxSessionName`, a hash — tmux names must be unique server-wide). Fulfils `send` (two `send-keys` calls: literal text, then `Enter`) and `find` (`has-session`, alive/dead only — no harness identity, no output-recency signal). |

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
(`launchInteractive`, `session/ops/launch.ts`), so a hands-off host never
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
(`null` for headless), `engine` (the harness), `hostSessionId`, `cwd`,
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

## Session notes and live state

An interactive launch on a `task/<id>`-branched `cwd` additionally writes a
`SessionNote` (`lib/services/host/session-note.ts`, [[T-UU2N]]) keyed to that
task's lease: `{lease, host, harness, sessionId, cwd, startedAt, state}`.
`state` is one of `SESSION_STATES`: `running` | `waiting_for_input` | `gone` —
`sessionStateForStatus` maps a harness's own hook/status payload
(`claudeHookStatus` for Claude) onto this shared vocabulary. A headless run
writes no note: there is no open host session for `Host.send` to ever reach.

Nothing updates a note after launch yet: `reconcileNotes` (re-finds a noted
session through the host's `find` part) and `reportStatusEvent` (the
hook-reporter entry point) both exist in `lib/services/host/`, but neither
has a production caller today. `session list`'s `state` column is therefore a
LAUNCH-TIME snapshot, not live status, until one of those is wired in.

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
  `SessionRecord` `session list`/`session attach` read and, for a
  task-branched launch, the `SessionNote`.
