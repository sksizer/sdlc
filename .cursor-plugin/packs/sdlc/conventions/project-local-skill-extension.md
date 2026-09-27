# Project-local skill extension via hooks

A convention that lets a consuming project add project-specific behavior to an upstream
`solutions/ontological/plugin/plugins/sdlc/skills/<name>/<name>.md` without modifying the upstream
skill's prose. The upstream skill stays general; project-local friction lives under `.sdlc/` in the
consuming repo (the SDLC plugin's own project-local runtime directory, distinct from `.claude/`
which is Claude Code's settings/hooks home).

## Why

When a consuming project keeps running into the same friction in an
upstream skill, the temptation is to fix it by editing the skill's
SKILL.md directly. That works once but contaminates a general skill
with consumer-specific behavior — every other consumer of the skill
inherits a path pattern, env var, or assumption that's only ever
exercised by the original project.

The recurring example in this repo: `/sdlc:task-work` running against
the sdlc plugin's own dev repo wants to detect when a task modifies
`solutions/ontological/plugin/plugins/sdlc/skills/<name>/<name>.md` and emit a note about the
runtime/worktree split. That's specific to the dev-on-plugin case;
no other consumer needs it. It belongs in this repo's `.sdlc/`, not
in `solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md`.

This convention gives such fixes a documented home.

## The mechanism — hook scripts at well-known paths

An upstream skill declares **named extension points** in its SKILL.md
prose. At each declared point, the skill checks for an executable file
at a well-known project-local path; if present, it runs the file with a
documented contract (inputs, exit-code semantics) and continues.

Extension-point path shape:

```text
.sdlc/skill-ext/<skill-slug>/<event-name>.sh
```

Why `.sdlc/` rather than `.claude/`: the SDLC plugin is logically
above and separate from Claude Code. `.claude/` is Claude Code's own
home for settings, hooks, and session state; `.sdlc/` is the SDLC
plugin's own project-local runtime directory. Project-local skill
extensions are SDLC-plugin-owned artifacts, so they live under
`.sdlc/`.

Where:

- `<skill-slug>` is the skill's slug (the directory name under
  `solutions/ontological/plugin/plugins/sdlc/skills/`, e.g. `task-work`, `task-define`).
- `<event-name>` is the named event from the skill's prose (e.g.
  `step1-post`, `step6-pre`). The skill picks the names; this convention
  doesn't enumerate a global event taxonomy.
- `.sh` extension by convention, but the file just needs to be
  executable — Python, shell, or any interpreter-prefixed script works.

The skill MUST:

1. Document each extension point inline in its SKILL.md prose, naming:
   - The exact path checked (`.sdlc/skill-ext/<slug>/<event>.sh`).
   - When in the skill's flow the check fires.
   - The inputs the hook receives (env vars, argv).
   - The exit-code semantics (informational vs blocking).
   - A reference back to this convention doc.

2. Check for the file with a simple `[ -x <path> ]` test. If absent
   or not executable, proceed as if the hook didn't exist — extension
   points are opt-in per project, absence is the default.

3. Invoke the hook with the documented inputs, in the project root's
   working directory (so relative paths in the hook resolve against
   the project, not the worktree).

4. Honor the exit-code contract the SKILL.md declared. Informational
   hooks ignore exit code; blocking hooks must surface non-zero
   exits to the user before deciding whether to continue.

The consuming project MUST:

1. Place the script at the exact path the skill documents.
2. Make it executable (`chmod +x`).
3. Honor the input contract (read env vars / argv the skill passes;
   don't assume anything else about the environment).
4. Exit with a code that matches the contract (0 for informational
   no-op, 0 for "all good, continue", non-zero only if the contract
   says non-zero means something).

## Discovery vs invocation

The skill discovers the hook by path; there's no registry, no manifest,
no orchestrator in between. This is deliberate:

- Zero configuration. The consuming project just drops a file at the
  documented path and it's wired up.
- No coupling to Claude Code's `settings.json` hook system. Those hooks
  fire at runtime events (PreToolUse, etc.); these hooks fire at
  skill-internal logical steps that have no runtime-event analogue.
- Easy to reason about. Looking at the skill's SKILL.md tells you
  exactly what extension points exist and where they fire. Looking at
  `.sdlc/skill-ext/` in the consuming repo tells you exactly which
  ones this project has plugged into.

## Why not project-local SKILL.md extension

A prose-layering alternative — an upstream skill discovering and
layering a project-local `SKILL.md` fragment procedurally — was
rejected: implicit composition, a fuzzier contract than argv/exit-codes,
and a mismatch with the actual friction (10-line scripts, not
multi-paragraph extensions). The default stays hooks.

## Worked example — task-work's step1-post hook

`solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md` declares an extension
point at the end of Step 1: after the task file is read and the headline captured, it checks for
`.sdlc/skill-ext/task-work/step1-post.sh` and, if present and executable, invokes it with
`TASK_FILE=<absolute-path>` in the environment. The hook is informational — exit code is ignored,
stdout/stderr are surfaced to the operator.

In this repo (the sdlc plugin's own dev repo), the hook scans the
task's `## Areas` section for `solutions/ontological/plugin/plugins/sdlc/skills/*/*.md`
references and prints a one-line note about the runtime/worktree split
if any are found:

```text
note: this task modifies solutions/ontological/plugin/plugins/sdlc/skills/task-work/task-work.md — the runtime
version is loaded from ${CLAUDE_PLUGIN_ROOT}, not the worktree, so edits
take effect only after the merged PR propagates to the global plugin path.
```

Other consumers of `/sdlc:task-work` don't ship this hook and never see
the note. The upstream skill stays general; the project-specific
behavior lives where it belongs.

## Adding a new extension point

When an upstream skill needs to expose a new extension point:

1. Pick an `<event-name>` that describes the moment, not the action:
   `step1-post`, `pre-pr-create`, not `scan-files-to-touch`. The
   event names the *when*; the hook script implements the *what*.
2. Add a numbered subsection to the relevant step in the SKILL.md
   (e.g. "### 1a. Project-local extension point"). State the path,
   when it fires, the input contract, and the exit-code semantics.
3. Reference this convention doc by relative path
   (`${CLAUDE_PLUGIN_ROOT}/conventions/project-local-skill-extension.md`).
4. Keep the contract minimal: pass only what the hook needs. Env vars
   for structured inputs; argv for positional values. Don't pass
   serialized state — the hook can read the file system itself.

When a consuming project wants to plug into the point:

1. Create the directory: `mkdir -p .sdlc/skill-ext/<skill-slug>/`.
2. Write the hook script (any language). Make it executable.
3. Honor the input contract. Exit 0 unless the contract specifies
   non-zero semantics.
4. Commit the hook to the repo so collaborators get it.

## Out of scope for this convention

- A registry of extension points across all skills. Each skill
  documents its own; there's no central index, because each skill is
  the canonical source for what it exposes.
- Chaining or composition of hooks. Each path holds at most one hook;
  if a project needs multiple behaviors at one point, the hook script
  composes them internally.
- Versioning of the hook contract. If a skill needs to change a hook's
  input or exit-code contract, that's a breaking change to the skill —
  treat it like any other SKILL.md prose change (PR, review, etc.) and
  bump the contract's documented version inline if needed.
