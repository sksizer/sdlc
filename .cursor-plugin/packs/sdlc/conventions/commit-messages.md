# Committing model-generated commit messages

Any commit message constructed from model output may contain conventional-commit
parentheses like `docs(tasks):`, `feat(scan):`, or `chore(entities):`. Under zsh
those parens get interpreted as a glob inside `"$(cat <<EOF ... EOF)"` command
substitution and the heredoc fails. Predictable temp paths like
`/tmp/commit-msg.txt` are also unsafe — a stale file from a parallel session
can land the wrong message on your commit.

## Preferred shape: `sdlc commit create`

The commit verb on the noun-verb registry makes the safe routing the
**default** path instead of something every caller has to remember. The
message reaches the op through argv or stdin (the `-` sentinel — bytes
the shell does NOT re-parse) and reaches git through an `mktemp`'d file,
which git reads verbatim. The parens/substitution/glob hazard cannot
recur regardless of the operator's login shell (fish, zsh, bash).

```text
# Whole message on stdin via a quoted heredoc (nothing the shell expands):
${CLAUDE_PLUGIN_ROOT}/cli/sdlc commit create --message - <<'EOF'
docs(tasks): verify foo implementation-ready

Body with (parens), $vars, and `backticks` — all literal.
EOF

# Structured: subject + optional body (blank line inserted between them).
${CLAUDE_PLUGIN_ROOT}/cli/sdlc commit create \
    --subject "docs(tasks): verify foo implementation-ready" \
    --body "One-line body."
```

Why prefer the verb over a hand-rolled heredoc:

- **No shell re-parse.** The subject/body arrive on argv or stdin; the
  shell expands them once (at the call site, under the caller's own
  quoting) and never again. There is no second heredoc parse to leak.
- **Collision-free tempfile, always.** The op `mktemp`s a fresh
  per-invocation directory internally — a caller cannot forget the
  `mktemp` step and reach for a predictable `/tmp/commit-msg.txt`.
- **Clear failure, not a usage dump.** When `git commit` fails the op
  exits non-zero with `git commit failed (exit N)` plus git's own
  diagnostic — never the confusing `git`-usage dump a mis-quoted `-m`
  produces. Input errors (no/two message sources, contract violations)
  carry the Zod issues.
- **Passthrough flags.** `--amend`, `--no-verify`, `--allow-empty`,
  `--signoff`, and repeatable `--passthrough <git-flag>` are forwarded to
  `git commit` unchanged. `--dry-run` validates and renders, commits
  nothing. `--project-root <path>` targets a worktree.

The hand-rolled heredoc below stays documented as the
no-CLI-available fallback (e.g. a sandbox that denies `bun`, or a
context where `${CLAUDE_PLUGIN_ROOT}` is not resolvable).

## Stereotyped messages: commit kinds (`--kind`)

For the recurring task-state subjects (`chore(tasks): start …`,
`docs(tasks): verify … implementation-ready`, `record PR for …`,
`mark … closed/done`, …) don't compose the message at all — render it
from the **task-lifecycle commit kind**, whose Zod contract + Eta
template are the single source of those shapes
(`solutions/ontological/lib/model/entities/task/commits/lifecycle/{schema.ts,template.eta}`,
registry in `solutions/ontological/lib/services/commit/kinds.ts`):

```text
${CLAUDE_PLUGIN_ROOT}/cli/sdlc commit create --kind task-lifecycle --data - <<'EOF'
{"action": "start", "basename": "<task-basename>", "detail": "<task headline>"}
EOF
```

The JSON payload travels on stdin inside a quoted heredoc, so its bytes
never participate in shell expansion. A contract-violating payload exits
`2` with the Zod issues and creates no commit. The lifecycle *producers*
(`ensure-ready-mutate.ts`, `close-commit.ts`) render through the same
template via `renderTaskLifecycleCommit` — change the template and every
producer follows. Adding a kind: see the registry
header. Raw `--message -` stays the right shape for one-off messages.

## Fallback: hand-rolled heredoc

```text
msgfile="$(mktemp -t sdlc-commit-XXXXXX)"
trap 'rm -f "$msgfile"' EXIT
cat > "$msgfile" <<'EOF'
<commit subject line>

<commit body — the quoted 'EOF' suppresses $( ), globs, and parameter
expansion>
EOF
git commit -F "$msgfile"
```

Two affordances matter, neither is optional:

- **`mktemp`** — collision-free path. Multiple `/sdlc:task-work` sessions
  running in parallel cannot accidentally use each other's message file.
- **Quoted `'EOF'` delimiter** — suppresses `$( )`, glob expansion, and
  parameter substitution inside the heredoc body. Critical when the model
  emits literal `$`, backticks, or parens in the message.

The `trap` is convenience-only — `git commit -F` consumes the file
synchronously; the tempfile is cleaned up on shell exit regardless.

## Antipatterns to avoid

- ❌ `git commit -m "$(cat <<EOF ... EOF)"` — heredoc inside command
  substitution. Breaks on conventional-commit parens under zsh.
- ❌ `git commit -F /tmp/commit-msg.txt` — predictable path. Races with
  parallel sessions.
- ❌ `git commit -m "literal multiline string with $variables and (parens)"` —
  shell-quoting hazards multiply with every special character.

✅ Reach for `sdlc commit create` first — it removes every antipattern
above by construction (argv/stdin in, `mktemp`'d file out). The
hand-rolled heredoc and the Write-tool path below are fallbacks for when
the registry CLI isn't reachable.

## Permissions (heredoc shape)

The canonical pattern shells out to `mktemp`, `cat` (with heredoc redirection),
and `git commit -F`. Under Claude Code, the harness enforces per-tool
permissions, and a missing entry for any of these verbs causes the operation
to be silently denied ("Permission to use Bash has been denied"). When that
happens mid-skill, the implementer falls back to single-line
`git commit -m "..."`, losing the multi-paragraph body the convention was
written to preserve.

At minimum, projects that adopt this convention need the following entries
in `.claude/settings.json` (or `.claude/settings.local.json`) under
`permissions.allow`:

```jsonc
"Bash(mktemp:*)",
"Bash(cat > *)",      // heredoc redirection into the mktemp'd path
"Bash(git commit:*)", // covers `git commit -F <path>` and friends
"Bash(rm -f *)",      // for the trap cleanup, if you keep it
```

`Bash(git *)` or `Bash(git:*)` alone is not sufficient — the heredoc step is
a separate `cat` invocation that the harness gates independently. If your
project already grants broad `Bash(*)` for trusted operators, no additional
entries are needed; the entries above are the narrow allowlist for projects
that pin permissions per-verb.

If granting `Bash(mktemp:*)` and `Bash(cat > *)` is not acceptable in your
sandbox profile, use the fallback below instead.

## Sandbox fallback (Write + `git commit -F`)

When the heredoc shape is blocked by the sandbox — and granting the permissions
above is not an option — author the commit message with the `Write` tool (which
the harness gates separately from `Bash`) into a collision-free tempfile, then
hand the path to `git commit -F`.

Procedure:

1. Generate a collision-free path. The same `mktemp` shape works if `mktemp`
   itself is permitted; otherwise use any unique-per-session shape that
   doesn't collide across parallel `/sdlc:task-work` sessions —
   `/tmp/sdlc-commit-<pid>-<random>.txt` works in practice. Predictable
   paths like `/tmp/commit-msg.txt` are still the wrong shape; the same
   race that bites the heredoc bites this fallback.
2. Use the `Write` tool to create the file with the literal commit message
   (subject line, blank line, body) as its contents. No shell quoting
   applies — the `Write` tool takes the text verbatim, so conventional-commit
   parens, `$`, backticks, and globs all pass through unchanged.
3. Run `git commit -F <path>` (still under `Bash(git commit:*)`).
4. Optionally `rm` the tempfile when done; `git commit -F` reads the file
   synchronously, so it's safe to remove immediately after the commit
   completes.

The only `Bash` permission this path requires beyond the project's existing
`git` entries is whichever invocation deletes the tempfile (if you keep
that step). Everything else routes through `Write`, which is gated by the
`Write` permission, not `Bash`.

Skills MAY choose either shape per their own conventions; the heredoc is
canonical for non-sandboxed contexts, the Write-tool fallback is canonical
for sandboxed contexts where the heredoc verbs are denied.

## When to use

Use one of the shapes above whenever a skill constructs a commit message
from model output: prefer `sdlc commit create` (kinds for stereotyped
messages, raw stdin for one-offs), fall back to the hand-rolled heredoc
when the registry CLI isn't reachable, and use the Write-tool path in
sandboxes that deny the Bash verbs. Skills that hard-code their commit
messages (no model substitution) do not need any of these patterns.

This convention is referenced from every SDLC skill that produces commit
messages from prose. Update *this file* when the pattern evolves; do not
re-document it in each skill.
