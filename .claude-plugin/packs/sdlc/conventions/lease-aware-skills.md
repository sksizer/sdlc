# Lease-aware skills

How a skill participates in the GitHub Ref Leases protocol. This
convention applies to every skill that (a) mutates a worktree, (b)
pushes to a `task/*` branch, or (c) takes a side effect that must be
serialized against other workers on the same task. The adopters are
`/sdlc:orchestrate`'s dispatch loop, `/sdlc:task-work`,
`/sdlc:pr-respond`, and `/sdlc:task-close-out`.

Spec source: `docs/planning/decisions/github-ref-leases/protocol.md`.
The library is `solutions/ontological/lib/services/lease/` (imported as
`@lib/services/lease`); skills reach it by shelling out to the
`${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease <verb>` CLI.

## 1. Discovery by branch name

Skills derive their task lease from the current Git branch. There is
no env-var handoff, no argv-passing of lease state, no dispatcher-
written context file. The pattern is uniform across orchestrate-
dispatched and operator-direct invocations:

```typescript
import {
  discoverLease,
  InvalidBranchForLease,
  RefNotFound,
} from "@lib/services/lease";

try {
  const lease = discoverLease();
} catch (exc) {
  if (exc instanceof InvalidBranchForLease) {
    // Branch is not of the shape `task/<task_id>` — wrong branch, or
    // a detached HEAD. Exit cleanly with a structured marker; the
    // operator either renames the branch or runs the skill against
    // the right worktree.
    process.stderr.write(`INVALID-BRANCH branch=${exc.branch}\n`);
    process.exit(1);
  }
  if (exc instanceof RefNotFound) {
    // Branch is shaped correctly, but no lease ref exists at
    // `refs/sdlc/tasks/<task_id>`. The lease was either never
    // claimed (caller jumped a step) or has been closed (the
    // close-out skill deletes the ref). Same failure shape as above.
    process.stderr.write(`LEASE-MISSING task_id=…\n`);
    process.exit(1);
  }
  throw exc;
}
```

`discoverLease()` performs the derivation: `git branch --show-current`
→ strip the `task/` prefix → `task_id` → `refs/sdlc/tasks/<task_id>` is
the lease ref. The library reads the ref via `FETCH-REF` (one
round-trip against the configured authority) and returns a validated
`TaskLifecycleLease` model. Branches that do not match `task/<task_id>`
are NOT lease-eligible — they throw `InvalidBranchForLease`. See
`solutions/ontological/conventions/branch-naming.md` for the canonical branch
naming convention.

**Why discovery, not handoff:** the lease ref at the authority is the
source of truth; the dispatcher's role ends at successfully claiming
that ref. Anything the dispatcher could pass through env vars or argv
is necessarily a stale copy. Discovery by branch keeps the dispatched
sub-agent and a manually-invoked operator on byte-identical code
paths, and makes the lease state inspectable at any time by anyone
with read access to the authority — no out-of-band state in flight.

## 2. Atomic-per-call library surface

Every high-level lease entrypoint
(`acquireLease`, `transitionLease`, `heartbeatLease`,
`reacquireLease`, `releaseToArchive`, `fetchLease`,
`discoverLease`) is **atomic-per-call**: each invocation issues
its own `FETCH-REF` round-trip against the configured authority,
performs the CAS (or read), and returns a validated
`TaskLifecycleLease` value. Callers never thread state between
library calls — every entrypoint is a self-contained RPC.

Practical consequence for skill code:

- A skill that wants the lease's current state in two different
  steps calls the library twice. Each call costs one
  `git fetch` against the authority (sub-second locally). Skills
  do **not** keep a long-lived in-process or on-disk copy.
- The returned `TaskLifecycleLease` is a value type. Use it for
  inspection and logging (`lease.phase`, `lease.owner`,
  `lease.lease_id`); never call methods on it that pretend to
  mutate. Mutation always goes through an explicit second library
  call.
- The library carries no filesystem cache.

This shape is intentional. A shared cache would have to stay
coherent across fresh-worktree starts, worktree-vs-main-repo
project-root ambiguity, and callers reaching around the public
surface — whole classes of bug that cannot exist when there is no
shared state at all. The cost is one extra `git fetch` per
operation (~5 per task lifecycle).

## 3. Validate before side effect

A lease-aware skill MUST call `discoverLease()` before any worktree
mutation, `git push`, PR creation, or `gh` API call that has external
effect. On failed discovery (`InvalidBranchForLease`, `RefNotFound`,
or any other `LeaseError`), the skill exits cleanly with a structured
stderr line and zero side effects attempted.

The pattern is "discovery-first, action-second":

1. Call `discoverLease()` immediately on entry, before any read/write
   to the working tree, before any subprocess that pushes, before any
   `gh` invocation.
2. Inspect the returned `TaskLifecycleLease`: confirm `phase` matches
   the expected stage of the skill (e.g. `/sdlc:task-work` expects
   `claimed` or `working`; `/sdlc:pr-respond` expects
   `awaiting-review`), confirm `expires_at` is comfortably in the
   future for the work the skill plans to do.
3. Only after both checks pass does the skill begin mutating state.

If the skill's planned work exceeds the remaining TTL, the skill MUST
either heartbeat (extend `expires_at` via a `CAS-REPLACE`) or refuse
and exit with a `LEASE-EXPIRY-IMMINENT` marker. Working past
`expires_at` is a protocol violation and risks another worker
stealing the lease mid-side-effect.

## 4. Acquire-lease semantics

For skills that mutate `refs/sdlc/tasks/<task_id>` rather than just
read it, `acquireLease(task_id)` is the **single canonical entry
point** for claiming or inheriting the lease. Two execution paths
funnel through one call so the skill implementation does not branch
on dispatcher-vs-operator origin:

- **Operator-direct first-claim:** the operator invokes the skill
  with no pre-existing lease ref. `acquireLease` `CAS-CREATE`s a
  fresh `claimed` lease whose `owner` is this host's `host_id`.
- **Orchestrate-dispatched inherit (same-host):** `/sdlc:orchestrate`
  has already `CAS-CREATE`d the lease in its dispatch step (per the
  same-host orchestration convention). The same `acquireLease`
  call now sees a pre-existing ref. It `FETCH-REF`s the existing
  payload; if `owner == currentHostId()`, the function returns
  the inherited payload as the legitimate inheritance result. The
  ref is NOT re-created — the dispatcher's claim is preserved.
- **Cross-host conflict:** the pre-existing ref's `owner` does not
  match this host. `acquireLease` throws `LeaseConflict(ref,
  owner)`; the skill exits cleanly with a structured stderr line
  and zero side effects (no worktree, no branch, no PR).

The CLI surface skills shell out to:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease task acquire <task_id>
```

Stdout on success: `ACQUIRED task=<id> lease_id=<uuid> phase=<phase>`.
A cross-host conflict exits 12 with `LEASE-CONFLICT ref=<ref>
owner=<other-host-id>` on stderr; the skill surfaces the same marker
and stops.

The library's `currentHostId()` reads a stable per-host UUID from
`host.json` in sdlc's fleet durable home (mints on first call). Skills
do not generate ad-hoc UUIDs for the `owner` field — that would
defeat the same-host inheritance check, because every `acquireLease`
call would mint a fresh owner UUID that never matches the dispatcher's.

**Discovery vs. acquisition.** `discoverLease()` (section 1) is the
read-side entry point for skills that already hold the lease and just
need its current state. `acquireLease()` is the write-side entry
point for skills that *claim* the lease (task-work being the
canonical example). Read-only skills call `discoverLease`; claim-side
skills call `acquireLease`.

## 4a. Re-acquire pattern

`acquireLease()` is for the FIRST claim — CAS-CREATE the ref, or
inherit when the same host already created it. Skills that *resume*
work on an existing lease — `/sdlc:pr-respond` taking over when a
review comment arrives, `/sdlc:task-close-out` taking over when the
PR merges — use a separate entry point: `reacquireLease(task_id,
target_phase)`.

The re-acquire is a CAS-REPLACE that rotates ownership and phase
atomically:

- `phase` flips to the target (`responding`, `closing`, or any other
  schema-allowed phase the skill argues into).
- `owner` flips to this host's `host_id`.
- `lease_token` rotates to a fresh UUIDv4 (fences out any in-flight
  heartbeat from the previous phase).
- `expires_at` resets to `now + ttl` for active phases, or `null`
  for the placeholder `awaiting-review` phase.

The CLI surface:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease task reacquire <task_id> --phase <phase>
```

Stdout on success: `REACQUIRED task=<id> phase=<phase> lease_id=<uuid>`.

**Steal-on-expired semantics.** If the discovered lease's
`expires_at` is in the past (the previous owner stopped
heartbeating), the re-acquire still CAS-REPLACEs cleanly — the
library logs `STOLEN ref=<ref> from=<previous-owner>` on stderr as
an informational marker (no operator decision required) and
proceeds. This is per the ADR's
[Steal an expired lease](../planning/decisions/github-ref-leases/protocol.md#steal-an-expired-lease)
section: a stale lease is documented intent to take over, not
operator misuse.

**CAS-race failure.** If another worker advanced the ref between
discovery and CAS-REPLACE, the library throws `LeaseConflict`. The
CLI maps that to exit 12 with `LEASE-CONFLICT ref=<ref>
owner=<other-host-id>` on stderr. Skills exit cleanly with the same
marker — no side effect attempted, no destructive operation runs.

**Missing-ref shape.** Re-acquire on a never-claimed task surfaces
as `RefNotFound`. The CLI maps it to exit 13 with
`REF-NOT-FOUND ref=<ref>` on stderr. Skills translate that
to a `LEASE-MISSING ref=<ref>` marker and redirect the operator at
`/sdlc:task-work` as the canonical claim entry point.

**Re-acquire vs. transition.** Both are CAS-REPLACE operations, but
they serve different callers:

- `reacquireLease` (CLI: `lease task reacquire`) is for **takeover**:
  the caller is a fresh worker resuming work on an existing lease and
  needs steal-on-expired semantics. Used by `/sdlc:pr-respond` and
  `/sdlc:task-close-out` as their entry gate.
- `transitionLease` (CLI: `lease task transition`) is for
  **caller-driven rotation**: the caller already holds the lease (via
  a prior acquire or re-acquire) and is rotating the phase as part of
  its own protocol step. Used by `/sdlc:task-work` to flip
  `working → awaiting-review` at PR open, and by `/sdlc:pr-respond`
  to flip `responding → awaiting-review` after pushing the
  response. Does NOT steal on expired — a transition past expired
  is a protocol violation that exits with `LEASE-EXPIRED`.

## 4b. PR-fencing check

Any skill that receives a PR number as input — currently only
`/sdlc:pr-respond` — MUST verify that the PR's lease-binding footer
agrees with the discovered lease's `lease_id` before any side
effect:

1. Fetch the PR body and parse the footer:

   ```text
   ${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease parse-footer <pr-number>
   ```

   Stdout: `FOOTER task=<task_id> lease=<lease_id>`. Exit 5 with
   `LEASE-FOOTER-MISSING pr=<n>` if the body has no parseable
   footer.

2. Fence the active lease against the footer's `lease_id`:

   ```text
   ${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease task fence <task_id> --expect-lease <footer_lease_id>
   ```

   On a match: `LEASE-FENCING-OK task=<id> lease_id=<id>` on stdout,
   exit 0 — proceed. On a mismatch, the lease was rotated since the
   PR was opened (another worker took it, or the PR was retargeted
   against a different lease cycle): the op prints
   `LEASE-FENCING-MISMATCH expected=<footer> actual=<discovered>` on
   stderr and exits 0 — the marker, not the exit code, is the
   dispatch surface. The skill exits cleanly with the same marker
   and no side effect. A missing active ref exits 13 with
   `LEASE-MISSING ref=refs/sdlc/tasks/<task_id>`.

The check IS the PR ↔ lease binding from the ADR's
[Fencing and PR↔lease binding](../planning/decisions/github-ref-leases/protocol.md#fencing-and-prlease-binding)
section. Without it, a PR opened against an old lease cycle could silently apply changes to a new
lease cycle's worktree — the fencing check is what makes the PR ID a stable handle on the lease.

## 4c. Archive-ref convention

The terminal step in `/sdlc:task-close-out` archives the lease at
`refs/sdlc/archive/tasks/<task_id>` and deletes the active ref at
`refs/sdlc/tasks/<task_id>`. The archive ref's history IS the audit
trail for the lease's full lifecycle — every phase transition's
commit is reachable from the archive ref's tip, so a post-close-out
inspection (`git log refs/sdlc/archive/tasks/<task_id>`) tells the
operator who held the lease at every phase boundary.

The CLI surface:

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease task archive <task_id>
```

Stdout on success: `ARCHIVED task=<task_id> archive_ref=refs/sdlc/archive/tasks/<task_id>`.

**Idempotency contract.** `sdlc lease task archive` is **idempotent**
— calling it twice against the same task ID is a clean no-op
success. The library detects both "archive ref already exists" and
"active ref already gone" and resolves both shapes to exit 0 without
raising. This makes the close-out flow safe to retry after a
partial-failure window:

- If the archive write landed but the active delete didn't: the
  retry sees the archive already in place, skips the create, and
  completes the delete.
- If both landed but the close-out crashed before emitting the
  marker: the retry sees the active ref already gone, exits clean,
  and the close-out's downstream verification matches.

Close-out callers MUST use `task archive`. The ref-level
`sdlc lease release <ref>` performs the same archive-then-delete
against a raw ref path and stays for the operator's manual
escape-hatch use cases.

After archive, the active namespace is empty. The next
`/sdlc:task-work` invocation against the same `task_id` would
CAS-CREATE a fresh ref — a new lease lifecycle starts with no
relationship to the previous one (except the archive ref's
historical record).

## 5. Heartbeat shape

A skill whose work exceeds the lease's `expires_at` window MUST
heartbeat to extend the TTL. The canonical shape — used by
`/sdlc:task-work` around the implementation sub-agent's run and by
`/sdlc:pr-respond` around the response run — is to background the
`lease heartbeat-loop` service:

```bash
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease heartbeat-loop start <task-id> 2>>.sdlc/runtime/lease-heartbeat-<task-id>.log &
echo $! > .sdlc/runtime/lease-heartbeat-<task-id>.pid
# ...long-running work runs in the foreground...
kill $(cat .sdlc/runtime/lease-heartbeat-<task-id>.pid) 2>/dev/null
rm -f .sdlc/runtime/lease-heartbeat-<task-id>.pid
```

The loop calls the library's `heartbeatLease` once per tick. That
entrypoint is atomic-per-call: it fetches the
authority-current payload, builds a new commit that differs only
in `expires_at`, and CAS-REPLACEs in one round-trip. SIGTERM
exits the loop cleanly with exit 0; a `CAS-FAILED` on any tick
exits non-zero so the parent skill surfaces the failure rather
than continuing to heartbeat a ref it no longer owns.

Required properties:

- **Cadence: `TTL/2`**. Half the lease's TTL is the safe upper bound:
  if a heartbeat is lost (network blip, scheduler stall), the next
  one still lands before `expires_at` elapses. The heartbeat-loop
  service defaults to TTL/2 (a 1800s interval against the 3600s
  default TTL); skills do not override the cadence unless a test
  requires it.
- **Always kill the loop on shutdown**. The skill records the PID
  on launch and `kill`s it in a trap/finally so success, failure,
  and exception paths all reap the loop. A heartbeat that survives
  the parent skill leaves the lease stuck on the wrong
  `expires_at`.
- **Respect the minimum-frequency floor.** The protocol caps
  heartbeat frequency at `TTL/4` — skills do not heartbeat faster.
  The TTL/2 cadence is comfortably above the floor.

Operation-lease skills (long-running reconcile jobs, scheduled
GitHub Actions) may need different scheduling shapes, but the
task-lifecycle pattern is fixed here.

## 6. Running the cutover migration

Every lease-aware skill consults `refs/sdlc/control-plane` on the
configured authority and refuses to run if the ref is missing. The
ref exists only after a one-time cutover migration has been run
against each project that adopts the protocol.

The cutover migration is a single command:

```bash
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease migrate            # actually run
${CLAUDE_PLUGIN_ROOT}/cli/sdlc lease migrate --dry-run  # preview without mutating
```

The command runs the ADR's cutover procedure verbatim (see
`docs/planning/decisions/github-ref-leases/protocol.md`,
"Migration of in-flight tasks at cutover"):

1. Probes `refs/sdlc/control-plane`. If the ref already exists, the
   command aborts with `MIGRATION-ALREADY-RUN authority=<auth>`
   on stderr and exits non-zero. Running migrate a second time is a
   bug, not a feature — the ADR is explicit on this. Idempotent-by-
   construction.
2. Scans `docs/planning/tasks/*.md` for files at `status: in-progress`.
3. For each, derives the initial lease phase from observable state:
   open PR exists → `awaiting-review`; work branch only → `working`;
   neither → `stale-requires-review` (logged + skipped, run continues).
4. Halts before any write if a single task has multiple open PRs —
   the operator must pick one canonical PR before re-running.
5. Mints a synthetic lease per migrate-able task with the sentinel
   `host_id = 00000000-0000-4000-8000-6d6967726174` (the label
   `"migrated-pre-cutover"` lands in `notes`). `lease_id` and
   `lease_token` are fresh UUIDv4s; `expires_at` is `now + TTL` for
   `working`, `null` for `awaiting-review`.
6. CAS-CREATEs `refs/sdlc/tasks/<task_id>` per minted lease.
7. For `awaiting-review` leases: chains a second commit carrying a
   placeholder `handoff.md` (`"migrated; see PR description"`) so
   successor pr-respond / close-out workers find the canonical
   shape.
8. For tasks with open PRs: appends the canonical lease footer to
   the PR body via `gh pr edit`.
9. Initializes `refs/sdlc/control-plane` as the LAST mutation so a
   partial migration does not unblock the lease-aware skills.
10. Writes `.sdlc/migration.log` — one JSON line per processed task,
    capturing the per-task action taken.

After cutover completes, the lease-aware skills (`/sdlc:orchestrate`,
`/sdlc:task-work`, `/sdlc:pr-respond`, `/sdlc:task-close-out`) start
proceeding past the control-plane gate. The migration sentinel
`host_id` is retired on each task's next legitimate phase transition
— `owner` rotates to the acting host's UUID and `lease_token`
rotates with it. The lease history retains the sentinel as the first
owner for audit purposes.

See `solutions/ontological/cli/README.md` for the shared exit-code reference;
each verb's `--help` documents its stdout/stderr markers.

## 7. Fail closed

There is no fallback / dual-mode / "skip discovery if the library
isn't available" path. The protocol is the system: a skill that
cannot complete discovery is a skill that cannot safely run.

Concretely:

- If the lease CLI subprocess fails (`bun` missing from PATH,
  launcher not found, module-resolution failure), the skill emits a
  single structured stderr line naming the failure and exits
  non-zero. The operator fixes the environment; the next invocation
  succeeds.
- If `discoverLease()` throws `InvalidBranchForLease`, the skill
  emits `INVALID-BRANCH branch=<name>` and exits 1.
- If `discoverLease()` throws `RefNotFound`, the skill emits
  `LEASE-MISSING task_id=<id>` and exits 1.
- If any other `LeaseError` (network, schema, namespace conflict)
  propagates from the library, the skill emits the message verbatim
  and exits 1.

Rationale: a half-working coordination primitive is worse than none —
it gives the operator a false sense of safety. There is no degraded
mode safe enough to ship.

## Skills that adopt this convention

- `solutions/ontological/plugin/plugins/sdlc/skills/orchestrate/orchestrate.md` — control-plane gate
  plus lease-claim gate per candidate. Orchestrate does not call `discoverLease()` itself (the
  orchestrator parent is not bound to a task); the dispatched `/sdlc:task-work` sub-agent does, as
  the first step in its own body.
- `solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md` — acquire gate
  (`lease task acquire`) on entry, heartbeat loop around the
  implementation sub-agent, `lease task transition` to
  `awaiting-review` at PR open.
- `solutions/ontological/plugin/plugins/sdlc/skills/pr-respond/pr-respond.md` and
  `solutions/ontological/plugin/plugins/sdlc/skills/task-close-out/task-close-out.md` — re-acquire
  pattern (`lease task fence` + `lease task reacquire`) for skills that resume work on an existing
  lease.
