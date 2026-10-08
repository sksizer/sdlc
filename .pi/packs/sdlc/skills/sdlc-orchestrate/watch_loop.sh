#!/usr/bin/env bash
# Never-exiting poll wrapper for the `sdlc orchestrate watch` pending-work
# gate (T-7AR0). A `persistent: true` Monitor runs this so each PENDING line
# the gate emits becomes one wake event; the loop itself NEVER exits, so the
# Monitor keeps watching across idle periods.
#
# Contract (matches the Monitor tool's event model):
#   - stdout is the ONLY per-poll channel — each `PENDING …` line is one event.
#     The gate prints at most one line per poll and nothing when idle, so an
#     idle period produces zero events (and zero orchestrator transcripts).
#   - exit codes are NOT a signal: the gate exits 0 in every state (pending,
#     empty, gh-failure), and this loop never propagates a poll's status. There
#     is deliberately NO `set -e` — a transient `gh`/network blip must not kill
#     the wrapper. A failed poll degrades to "no event this tick" and the loop
#     continues.
#   - the loop runs forever; stop it by stopping the Monitor (TaskStop).
#
# Usage (a standalone event-gated wake companion to the `/sdlc:orchestrate`
# skill's `--once` tick — see SKILL.md's "Loop cadence" section; this script
# is the homed Monitor wrapper for the `sdlc orchestrate watch` gate):
#
#   Monitor(
#     command: "${CLAUDE_PLUGIN_ROOT}/skills/orchestrate/watch_loop.sh <main-repo>",
#     persistent: true,
#   )
#
# Args:
#   $1  project root (the main repo the gate runs against). Default: $PWD.
# Env:
#   SDLC_WATCH_INTERVAL   poll interval seconds (default 60; floor 30 — the
#                         gate's conditional requests keep idle polls ~free,
#                         but stay >=30s to respect API rate limits).
#   SDLC_CLI              override the `sdlc orchestrate watch` invocation
#                         (default: `${CLAUDE_PLUGIN_ROOT}/cli/sdlc`).

project_root="${1:-$PWD}"

interval="${SDLC_WATCH_INTERVAL:-60}"
case "$interval" in
  ''|*[!0-9]*) interval=60 ;;
esac
if [ "$interval" -lt 30 ]; then
  interval=30
fi

cli="${SDLC_CLI:-${CLAUDE_PLUGIN_ROOT}/cli/sdlc}"

while true; do
  # The gate prints at most one PENDING line (an event) and exits 0 in every
  # state. `|| true` belt-and-braces guards against any non-zero so the loop
  # never dies on a transient failure. stderr (diagnostics) is not an event.
  $cli orchestrate watch --project-root "$project_root" || true
  sleep "$interval"
done
