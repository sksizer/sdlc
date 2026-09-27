export const meta = {
  name: 'docs-sweep',
  description:
    'Sweep comment blocks shard by shard, then verify what was removed AND what was written',
  phases: [
    { title: 'Sweep', detail: 'one agent per shard; shards are disjoint by file' },
    {
      title: 'Removals',
      detail: 'review removals whose knowledge did not survive into the replacement',
    },
    { title: 'Claims', detail: 'verify the assertions the sweep ADDED are true' },
  ],
}

// ---------------------------------------------------------------------------
// `args` from /sdlc:docs-sweep:
//   { shards: [{ id, band, lines, files: [...] }], rubric, repoRoot, reportOnly }
//
// Shards arrive disjoint by file — `sdlc project scan comments` asserts it.
// This script never re-groups them; re-grouping is how two agents end up
// editing one file.
// ---------------------------------------------------------------------------

const SHARDS = (args && args.shards) || []
const RUBRIC = (args && args.rubric) || ''
const REPORT_ONLY = !!(args && args.reportOnly)

if (SHARDS.length === 0) return { error: 'no shards supplied' }

const SWEEP_SCHEMA = {
  type: 'object',
  required: ['shard', 'files_read', 'files_edited', 'declined', 'removed', 'stale_found'],
  properties: {
    shard: { type: 'string' },
    files_read: { type: 'number' },
    files_edited: { type: 'number' },
    declined: { type: 'number', description: 'Files read and deliberately left alone.' },
    removed: { type: 'number' },
    stale_found: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'claim', 'actual'],
        properties: {
          path: { type: 'string' },
          claim: { type: 'string' },
          actual: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['shard', 'checked', 'corrections'],
  properties: {
    shard: { type: 'string' },
    checked: { type: 'number' },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'what'],
        properties: {
          file: { type: 'string' },
          what: { type: 'string' },
          kind: { type: 'string' },
        },
      },
    },
    corruptions: { type: 'number' },
    notes: { type: 'string' },
  },
}

// ── the three briefs ────────────────────────────────────────────────────────

function sweepBrief(shard) {
  return [
    `You are sweep shard ${shard.id} of a documentation and comment sweep.`,
    '',
    'You own these files EXCLUSIVELY. Other agents are editing other files in the',
    'same worktree right now; editing any path not in this list destroys their work.',
    '',
    shard.files.map((f) => `  ${f}`).join('\n'),
    '',
    'For each file: read the nominated comment blocks WITH the code around them,',
    'then apply this rubric. It is the whole judgement of the sweep — follow it',
    'exactly, do not paraphrase it into your own policy.',
    '',
    RUBRIC,
    '',
    'Accuracy first. If a comment is WRONG, fix it even when that makes it longer.',
    'Roughly 80% of comment lines carry something the code does not state, so most',
    'of what you read should survive. Reading a file and leaving it alone is a',
    'successful outcome and is what `declined` counts — do not edit to look busy.',
    '',
    'Never delete a line of code. Never touch a runtime string (a tool',
    'description, an error message, a CLI help line); those are behaviour, not',
    'comments, whatever they look like.',
    '',
    'Record in `stale_found` every comment that claimed something the code',
    'contradicts, with what it claimed and what is actually true.',
    `Set "shard" to "${shard.id}". Return only the JSON object.`,
  ].join('\n')
}

function removalBrief(shard) {
  return [
    `You are removal-review shard ${shard.id}.`,
    '',
    'A sweep just rewrote comments in these files. Your job is to find where it',
    'destroyed knowledge, and put it back. You are not here to make things shorter',
    'and not here to agree with the sweep.',
    '',
    shard.files.map((f) => `  ${f}`).join('\n'),
    '',
    'For each file run `git diff -- <path>` and read every removed line against the',
    'kept context. Ask one question per line: was a constraint, contract, gotcha,',
    'coupling, or measured fact lost here?',
    '',
    'Restore what was lost, in as few words as carry the fact — you need not restore',
    'the original wording. Leave correctly-removed lines removed: restatement of the',
    'adjacent code, provenance narrative, and prose that demonstrably survives',
    'elsewhere (grep to confirm before accepting a dedup removal).',
    '',
    'Highest priority: if a removal took out CODE rather than a comment — a',
    'signature, a brace, an import, a struct field — restore it immediately and',
    'count it in `corruptions`.',
    '',
    'Edit only files in your list. Never revert a whole file; restore the specific',
    'fact. When genuinely unsure after checking, restore.',
    `Set "shard" to "${shard.id}". Return only the JSON object.`,
  ].join('\n')
}

function claimBrief(shard) {
  return [
    `You are claim-verification shard ${shard.id}.`,
    '',
    'Every other pass asked whether something was LOST. You ask whether what the',
    'sweep WROTE is TRUE. This is the only failure mode nothing else covers, and a',
    'confidently-wrong comment is worse than the verbose one it replaced.',
    '',
    shard.files.map((f) => `  ${f}`).join('\n'),
    '',
    'Run `git diff -- <path>` and take the ADDED lines that assert something',
    'checkable: a cited path, a decision id or section number, a count ("the two',
    'ports", "the one endpoint"), a must/never/only, or a claim about what a',
    'function returns. Verify each against the code, file, or record it names.',
    'Open them. Count the things. Do not accept a claim because it reads well.',
    '',
    'Watch for one specific error above all others. Dropping history narrative is',
    'right when the history is provenance and WRONG when the history is the fact:',
    '  "Every body moved VERBATIM out of api/v1/backup.rs"  (true)',
    '  "is a VERBATIM copy of the one in api/v1/backup.rs"  (false — it moved,',
    '   and that file now holds one-line dispatches)',
    'A rewrite like that asserts a duplicate implementation that does not exist.',
    '',
    'Fix every false claim so it states the truth. Record what it claimed and what',
    'is actually the case. Change nothing you have merely verified — you are',
    'checking facts, not polishing prose.',
    `Set "shard" to "${shard.id}". Return only the JSON object.`,
  ].join('\n')
}

// ── run ─────────────────────────────────────────────────────────────────────

// Pipelined, not barriered: a shard that finishes sweeping starts its own
// removal review while other shards are still sweeping. Because shards are
// disjoint by file, later stages never contend with an earlier stage's edits
// in another shard.
const results = await pipeline(
  SHARDS,
  (s) => agent(sweepBrief(s), { label: `sweep:${s.id}`, phase: 'Sweep', schema: SWEEP_SCHEMA }),
  (swept, shard) => {
    if (REPORT_ONLY || !swept || swept.files_edited === 0) return { swept, removals: null }
    return agent(removalBrief(shard), {
      label: `removals:${shard.id}`,
      phase: 'Removals',
      schema: VERDICT_SCHEMA,
    }).then((removals) => ({ swept, removals }))
  },
  (prev, shard) => {
    if (REPORT_ONLY || !prev || !prev.swept || prev.swept.files_edited === 0) {
      return { ...prev, claims: null }
    }
    return agent(claimBrief(shard), {
      label: `claims:${shard.id}`,
      phase: 'Claims',
      schema: VERDICT_SCHEMA,
    }).then((claims) => ({ ...prev, claims }))
  },
)

const ok = results.filter(Boolean)
const swept = ok.map((r) => r.swept).filter(Boolean)
const removals = ok.map((r) => r.removals).filter(Boolean)
const claims = ok.map((r) => r.claims).filter(Boolean)

const failed = SHARDS.length - swept.length
if (failed > 0) log(`${failed} shard(s) returned nothing — their files were NOT swept`)

return {
  shards: { total: SHARDS.length, swept: swept.length, failed },
  files_read: swept.reduce((n, r) => n + (r.files_read || 0), 0),
  files_edited: swept.reduce((n, r) => n + (r.files_edited || 0), 0),
  // Reported as prominently as the reductions: a file read and left alone is
  // the sweep exercising judgement, not the sweep failing to act.
  declined: swept.reduce((n, r) => n + (r.declined || 0), 0),
  removed: swept.reduce((n, r) => n + (r.removed || 0), 0),
  stale_found: swept.flatMap((r) => r.stale_found || []),
  restored: removals.flatMap((r) => r.corrections || []),
  corruptions: removals.reduce((n, r) => n + (r.corruptions || 0), 0),
  false_claims_fixed: claims.flatMap((r) => r.corrections || []),
  notes: [...swept, ...removals, ...claims]
    .map((r) => (r.notes ? `${r.shard}: ${r.notes}` : null))
    .filter(Boolean),
}
