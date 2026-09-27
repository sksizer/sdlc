export const meta = {
  name: 'bug-finder-reconcile',
  description:
    "Merge this run's bugfix branches into the open PRs they would conflict with — one aggregated push per PR",
  phases: [
    {
      title: 'Reconcile',
      detail: 'one agent per conflicting PR; all overlapping branches merged in a single push',
    },
  ],
}

// ---------------------------------------------------------------------------
// Inputs from /sdlc:bug-finder Step 8. The conflict matrix is computed
// deterministically by the skill (git merge-tree) BEFORE this runs — this
// workflow only resolves what is already known to conflict.
//   { plan: [{ prNumber, headRef, title, conflictsWith: [{branch, files}] }],
//     repoRoot, sdlc }
// ---------------------------------------------------------------------------

const PLAN = (args && args.plan) || []
const REPO_ROOT = (args && args.repoRoot) || '.'
const SDLC = (args && args.sdlc) || 'sdlc'

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prNumber', 'pushed', 'summary'],
  properties: {
    prNumber: { type: 'integer' },
    pushed: { type: 'boolean' },
    mergedBranches: { type: 'array', items: { type: 'string' } },
    conflictsResolved: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'resolution'],
        properties: { file: { type: 'string' }, resolution: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
    needsHuman: { type: 'string', description: 'set when a conflict could not be resolved safely' },
  },
}

function reconcilePrompt(entry) {
  const branches = entry.conflictsWith.map((c) => c.branch)
  return [
    `Keep open PR #${entry.prNumber} ("${entry.title}", head \`${entry.headRef}\`) from developing merge` +
      ' conflicts against the bugfix branches this run just opened.',
    '',
    'These branches touch the same lines as that PR:',
    entry.conflictsWith
      .map((c) => `  - ${c.branch}\n${c.files.map((f) => `      ${f}`).join('\n')}`)
      .join('\n'),
    '',
    'ONE PUSH. Every push to a PR branch triggers a full CI run, so merge ALL the branches' +
      ' above, resolve every conflict, and push exactly once at the end. Do not push after' +
      ' each merge, and do not push at all if nothing changed.',
    '',
    'Procedure, from a scratch worktree so no existing checkout is disturbed:',
    `  git -C ${REPO_ROOT} fetch origin`,
    `  git -C ${REPO_ROOT} worktree add --detach .sdlc/worktrees/bug-finder-reconcile-${entry.prNumber} origin/${entry.headRef}`,
    `  git -C <that worktree> switch -c reconcile-${entry.prNumber} --track origin/${entry.headRef}`,
    branches.map((b) => `  git -C <that worktree> merge --no-ff origin/${b}`).join('\n'),
    '',
    'Resolving a conflict: the bugfix side is a correctness fix with a stated mechanism; the PR' +
      " side is in-flight work. Keep BOTH intents — apply the fix to the PR's version of the" +
      ' code rather than reverting either side. If the two changes are genuinely incompatible,' +
      ' abort the merge, push nothing, and return `needsHuman` naming the file and the' +
      ' conflict. Never resolve by taking one side wholesale to make the merge go away.',
    '',
    'After the merges resolve, run the project quality checks in that worktree:',
    `  ${SDLC} quality run --config ${REPO_ROOT}/sdlc.yaml --project-root <that worktree>`,
    'If they fail because of your resolution, fix the resolution. If they fail for a reason that' +
      ' predates the merge, note it in `summary` and continue.',
    '',
    `Then push once: \`git -C <that worktree> push origin HEAD:${entry.headRef}\`, and comment on` +
      ` PR #${entry.prNumber} saying which bugfix branches were merged in and why. Finally remove` +
      ' the scratch worktree.',
    '',
    'Return what you merged, what you resolved, and whether you pushed.',
  ].join('\n')
}

if (PLAN.length === 0) {
  log("no open PR overlaps this run's bugfix branches — nothing to reconcile, no CI spent")
  return { reconciled: [] }
}

log(`${PLAN.length} open PR(s) conflict with this run's branches — one aggregated push each`)

const results = await parallel(
  PLAN.map(
    (entry) => () =>
      agent(reconcilePrompt(entry), {
        label: `reconcile:pr-${entry.prNumber}`,
        phase: 'Reconcile',
        schema: RESULT_SCHEMA,
        effort: 'high',
      }),
  ),
)

const reconciled = results.filter(Boolean)
const failed = PLAN.length - reconciled.length
if (failed > 0) log(`${failed} reconcile agent(s) returned nothing — those PRs were left untouched`)

return { reconciled }
