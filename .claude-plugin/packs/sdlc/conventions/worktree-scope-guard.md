# worktree-scope guard — pre-commit collision check

A pre-commit guard on the main checkout that rejects commits whose
staged paths collide with files inside an active
`.sdlc/worktrees/<basename>/` worktree. The guard exists to catch a
specific `/sdlc:task-work` failure mode where a sub-agent resolves an
absolute path against the main repo (instead of the worktree it was
briefed with) and silently lands edits on `main` instead of
`task/<basename>`.

The mismatch is otherwise only visible at `git status` time on either
tree — by which point the leak is already committed, and recovery
requires a diff-and-revert plus `git apply` into the right worktree.

## Components

- `sdlc gate worktree-scope` (`solutions/ontological/lib/services/gate/ops/worktree-scope.ts`)
  — the guard itself. Reads its own staged paths via
  `git diff --cached --name-only --diff-filter=ACMR`, walks
  `.sdlc/worktrees/*/` to find active worktree basenames, and exits
  non-zero if any staged path is also present inside a worktree.
- `lefthook.yml` (project root) — registers the guard as a
  `pre-commit` command. Lefthook is required only on the main
  checkout; linked worktrees self-skip (see "How it knows it's on
  main" below).

## Contract

The guard rejects a commit iff **all** of the following hold:

1. The current checkout is the main repo (not a linked worktree).
2. At least one directory exists under `.sdlc/worktrees/<basename>/`.
3. At least one staged path (add / modify / rename / copy — deletes
   are excluded) lies outside the carve-outs below.
4. That staged path also exists inside an active worktree's tree
   (`<repo-root>/.sdlc/worktrees/<basename>/<staged-path>`).

When it rejects, it prints the colliding path, names the worktree,
and tells the operator the path to re-apply the edit to.

## Carve-outs

- **`docs/planning/tasks/` is always allowed.** `/sdlc:task-work`
  Steps 5b and 11a intentionally edit task files on main (the status
  flip when starting work, and the `closed/done` flip at close-out
  time). Without this carve-out, every task-work run would have to
  bypass the guard at exactly the moments it does its mainline
  bookkeeping.
- **The committed generated-docs artifacts are always allowed.** The
  roots `docs/index.md`, `docs/glossary.md`, and `docs/references.md`
  (the exact committed wiki set `sdlc docs generate` writes) are carved
  out. These are deterministic build artifacts that are checked out in
  *every* worktree, so a staged generated artifact will always also
  exist inside some sibling worktree — that collision is never the stray
  hand-edit the guard exists to catch. The create-and-commit flows
  (`/sdlc:task-work`'s task-state commits and `sdlc backlog create`)
  regenerate + stage these on main alongside the source file (so the
  derived roster never drifts from the frontmatter —
  [[T-PA51-task-state-commits-regen-site-page]]); without the carve-out
  every such commit would false-positive against the roster page present
  in every worktree. The Astro/Starlight docs site (the configured
  `<docs_site>` directory, including its generated `sidebar.mjs`) is NOT
  in this set: it is gitignored and uncommitted
  ([[D-0010-deterministic-site-assembly]]), so it never appears in
  `git status` and needs no carve-out. The carve-out list is sourced
  from `GENERATED_DOCS_ROOTS` in `solutions/ontological/lib/util/generated-docs.ts`, the
  same constant the regenerate-and-stage helper filters on, so the two
  sides cannot drift apart.
- **`WORKTREE_SCOPE_GUARD=skip` env var bypasses the guard.** Intended
  for one-off rescues where the operator knows what they're doing —
  for example, finishing a previous run's botched commit by hand.

## How it knows it's on main

The guard inspects the checkout's `.git`:

- If `.git` is a **directory**, the checkout is the main repo. The
  guard runs normally.
- If `.git` is a **file** whose contents reference `worktrees/`, the
  checkout is a linked worktree. The guard exits 0 immediately —
  feat-branch commits land in their own worktree by construction;
  there is no leak to detect.

This means it is safe to keep `lefthook.yml` armed inside every
linked worktree; the guard self-skips.

## What it does NOT do

- It does not auto-rewrite the path into the worktree. The commit
  fails; the operator (or sub-agent) re-applies the edit by hand.
- It does not guard `git push` or any post-commit phase. The failed
  commit is the chokepoint; anything later is downstream.
- It does not run any quality checks. Those live in `sdlc.yaml`'s
  `verbs.check:` and are invoked by `/sdlc:task-work` Step 7, not
  by lefthook.

## Activation

The guard does nothing until lefthook is installed and wired into
`.git/hooks/`:

```sh
brew install lefthook          # one-time, per machine
lefthook install               # one-time, per checkout
```

A fresh clone (or a contributor without lefthook installed) is
unguarded — `lefthook.yml` is declarative; the hook itself only fires
when lefthook is in place. This catches the agent-driven failure mode
on a machine running parallel `/sdlc:task-work` sessions, not a
missing-lefthook gap; a CI-side check is out of scope here.

## Exit codes

- `0` — no collision (or carved out / no active worktrees / inside a
  worktree / `WORKTREE_SCOPE_GUARD=skip`).
- `1` — collision detected; details on stderr.
- `2` — script error (not in a git repo, etc.).
