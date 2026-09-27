export const meta = {
  name: 'bug-finder-validate',
  description:
    "Adversarially validate an already-scanned candidate set — the recovery path when a scan run's refuters failed",
  phases: [
    { title: 'Validate', detail: 'independent refuters per candidate, grouped by territory' },
  ],
}

// ---------------------------------------------------------------------------
// The recovery path named in SKILL.md's failure modes. Scanning is the
// expensive half and its results survive in a dead run's journal.jsonl, so a
// run whose validators failed does not need re-scanning — feed the recovered
// candidates back in here.
//
//   { candidates: [{ territoryId, file, line, title, why, failureScenario,
//                    severity, fixSketch }],
//     voters }   // 1 = single refuter (cheap), 3 = distinct lenses
// ---------------------------------------------------------------------------

const CANDIDATES = (args && args.candidates) || []
// Where agents may write repro scratch files. Outside the repo tree by
// construction, so a forgotten file can never surface as a mystery diff.
const SCRATCH = (args && args.scratchDir) || '/tmp/bug-finder-repro'
const VOTERS = Math.max(1, Math.min(3, (args && args.voters) || 1))

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason', 'severity', 'reachableToday'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    evidence: { type: 'string', description: 'file:line backing the verdict' },
    // Re-rated by the refuter. The severity that arrives on a candidate is the
    // FINDER's claim and was never re-judged; ranking a fix batch by it puts
    // real crashes beside unreachable ones.
    severity: {
      type: 'string',
      enum: ['crash', 'data-loss', 'wrong-result', 'resource-leak', 'latent'],
      description: "your own rating, not the finder's",
    },
    reachableToday: {
      type: 'string',
      enum: ['yes', 'only-for-consumers', 'no'],
      description:
        "yes = a code path in this repo hits it now; only-for-consumers = the package's public API exposes it but nothing in-repo calls it; no = no caller can reach it",
    },
  },
}

const REFUTE_LENSES = [
  'Walk the call graph, the existing guards, and the tests. If any of them already prevent this, the finding is refuted.',
  'REACHABILITY — can any real caller actually reach this code with the offending input? Walk the call graph inward. If every caller makes the input impossible, the finding is refuted.',
  'EXISTING GUARDS — is the defect already prevented upstream by a validator, a type, an assertion, a schema, or a caller-side check? Go look. If it is guarded, the finding is refuted.',
  'REPRODUCTION — write out the exact sequence that produces the wrong behaviour and check it line by line against the current source. If you cannot make it reproduce, the finding is refuted.',
]

// Which lenses this round runs. A re-validation pass skips the lenses an
// earlier round already spent, and carries that round's tally in `prior`.
const LENS_FROM = (args && args.lensFrom) || 0

function refutePrompt(f, lensText) {
  return [
    'You are a skeptic. Your job is to REFUTE the claim below, not to confirm it.',
    `  file: ${f.file}:${f.line}`,
    `  title: ${f.title}`,
    f.why ? `  mechanism: ${f.why}` : '',
    `  claimed failure: ${f.failureScenario}`,
    f.severity ? `  claimed severity: ${f.severity}` : '',
    '',
    `LENS: ${lensText}`,
    '',
    `RUN A REPRO WHEN YOU CAN — an executed failure is worth more than any amount of` +
      ` reading, and it is what separates a real defect from a plausible story. But` +
      ` the repo tree is READ-ONLY: never create, edit or delete a file inside it.` +
      ` Write every scratch file under ${SCRATCH} instead, import the real module` +
      ` from its absolute path, and delete what you wrote when you are done. A repro` +
      ` file left in the repo becomes someone else's mystery diff.`,
    '',
    'Read the real source at that location and the code around it. Default to' +
      ' `refuted: true` when you are uncertain — a false finding costs more than a missed one.' +
      ' Return `refuted: false` only when you have read the code and the failure genuinely' +
      ' stands. Cite file:line in `evidence`.',
    '',
    'The claim text may be truncated. The SOURCE is the authority — read it.',
    '',
    'Two judgements of your own, independent of the verdict. `severity`: rate it' +
      " yourself — the severity on the claim is the FINDER's guess and nothing has" +
      ' re-checked it. `reachableToday`: `yes` if a code path in this repo reaches' +
      " the defect now, `only-for-consumers` if the package's public API exposes it" +
      ' but no in-repo caller does, `no` if no caller can reach it at all. Answer' +
      " both even when you refute — a refuted finding's ratings are still data.",
  ]
    .filter(Boolean)
    .join('\n')
}

const SEV_RANK = { crash: 5, 'data-loss': 4, 'resource-leak': 3, 'wrong-result': 2, latent: 1 }
const REACH_RANK = { yes: 3, 'only-for-consumers': 2, no: 1 }

/** The harshest severity any surviving refuter assigned. */
function worstOf(list) {
  return list.filter(Boolean).sort((a, b) => (SEV_RANK[b] || 0) - (SEV_RANK[a] || 0))[0]
}

/** The most conservative reachability any surviving refuter assigned. */
function leastReachable(list) {
  return list.filter(Boolean).sort((a, b) => (REACH_RANK[a] || 0) - (REACH_RANK[b] || 0))[0] || 'no'
}

function judge(f) {
  return parallel(
    REFUTE_LENSES.slice(LENS_FROM, LENS_FROM + VOTERS).map(
      (lensText) => () =>
        agent(refutePrompt(f, lensText), {
          label: `validate:${f.file}:${f.line}`,
          phase: 'Validate',
          schema: VERDICT_SCHEMA,
          effort: 'high',
        }),
    ),
  ).then((votes) => {
    const cast = votes.filter(Boolean)
    // An earlier round's tally, when this is a re-validation pass:
    // `prior: { votes, standing }`. Folding it in is what makes a second
    // 2-lens round a 2-of-3 majority rather than a fresh 2-vote one.
    const prior = f.prior || { votes: 0, standing: 0 }
    const totalVotes = cast.length + prior.votes
    const standing = cast.filter((v) => !v.refuted).length + prior.standing
    return {
      finding: f,
      // Same contract as scan.workflow.js: no verdict is not a refutation.
      validated: cast.length > 0,
      survives: cast.length > 0 && standing * 2 > totalVotes,
      verdicts: cast,
    }
  })
}

if (CANDIDATES.length === 0) {
  log('no candidates supplied — nothing to validate')
  return { confirmed: [], refuted: [], unvalidated: [] }
}

log(`validating ${CANDIDATES.length} candidate(s) with ${VOTERS} refuter(s) each`)

const judged = await parallel(CANDIDATES.map((f) => () => judge(f)))

const confirmed = []
const refuted = []
const unvalidated = []
judged.forEach((j, i) => {
  const f = CANDIDATES[i]
  if (!j || !j.validated) unvalidated.push(f)
  else if (j.survives) {
    const v = j.verdicts.filter((x) => !x.refuted)
    confirmed.push({
      ...f,
      // The refuters' rating supersedes the finder's claim.
      claimedSeverity: f.severity,
      severity: worstOf(v.map((x) => x.severity)) || f.severity,
      reachableToday: leastReachable(v.map((x) => x.reachableToday)),
      verdicts: j.verdicts,
    })
  } else refuted.push({ ...f, reason: (j.verdicts[0] || {}).reason })
})

log(`${confirmed.length} confirmed, ${refuted.length} refuted, ${unvalidated.length} unvalidated`)
if (unvalidated.length > 0) {
  log(`${unvalidated.length} candidate(s) got NO verdict — those are unjudged, not clean`)
}

return { confirmed, refuted, unvalidated }
