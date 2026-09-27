# Hosts — where sdlc puts work in front of a person

A **host** is somewhere on this machine that can show a person their work:
the terminal they are in, a tab in a terminal app, a workspace in a
multiplexer, a desktop agent app. The contract lives in
`solutions/ontological/lib/services/host/contract.ts`; the implementations
sit one file each under `lib/services/host/hosts/`.

## The contract is fulfilled in parts

| Part | Request | What it does |
|---|---|---|
| `session` | `{cwd, engine, prompt, title}` | Open an interactive coding-agent session (`claude`, `codex`) with `prompt` as its first message |
| `terminal` | `{cwd, argv, title}` | Run `argv` in a terminal the person can see |

Every part is optional on a host. A terminal-shaped host (`terminal`,
`orca`, `cmux`) fulfils both, with `session` as `terminal` over the engine's
argv; a desktop agent app fulfils `session` only. A consumer asks for the part
it needs with `requirePart(host, 'session')` and gets `HostPartMissing` when
the host lacks it. There is no fallback to another host: the person chose this
one, and a session quietly opening somewhere else is worse than an error.

Each part returns the exit code to report — the process's own when the host
waits on it (`terminal`), `0` when it hands the work to another app — and
throws `Error` carrying the host's stderr when the hand-off fails.
`available()` says whether the host's binary or app is on this machine.

## Choosing a host

`pickHost(config, requested, featureSetting)` applies the one precedence rule
every consumer shares: a `--host` flag, else the feature's own key
(`pr_review.host`), else `host.default` in `sdlc.yaml`.

## Hosts today

| Name | Mechanism |
|---|---|
| `terminal` | Spawns in place with inherited stdio — the one sanctioned raw spawn, marked `@sdlc:ignore-spawn` |
| `orca` | `orca terminal create --worktree path:<cwd> --command …`; registers the repo and retries once on a miss |
| `cmux` | `cmux workspace create --cwd <cwd> --command …` |

Adding a host is one file under `hosts/`, a name in `HOST_NAMES`, and an
entry in `hostRegistry()`; a host that cannot run arbitrary commands simply
leaves `terminal` undefined.

## Consumers

- `sdlc pr review` — `session` in the PR's worktree.
