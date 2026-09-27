export const meta = {
  name: 'bug-finder-scan',
  description:
    'Scan each territory at three altitudes for bugs, then adversarially validate every candidate',
  phases: [
    {
      title: 'Scan',
      detail:
        'three altitude lenses per territory — in-function, in-module, in-library — looped until dry',
    },
    {
      title: 'Validate',
      detail:
        'independent refuters per candidate; a candidate survives only on a non-refuted majority',
    },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. `args` is the object /sdlc:bug-finder passes from Step 3:
//   { territories: [{ id, name, paths: [...], note }], mode, maxRounds }
// ---------------------------------------------------------------------------

const TERRITORIES = (args && args.territories) || []
// Where agents may write repro scratch files. Outside the repo tree by
// construction, so a forgotten file can never surface as a mystery diff.
const SCRATCH = (args && args.scratchDir) || '/tmp/bug-finder-repro'
const BOMB = !!(args && args.mode === 'bomb')
const MAX_ROUNDS = (args && args.maxRounds) || (BOMB ? 4 : 2)
const DRY_ROUNDS = BOMB ? 2 : 1
// Measured on the packages/ts run: a second refuter round killed 3 of 140
// findings (2%), while the reachability rating cut 31%. Extra voters are a weak
// filter and cost 2-3x, so bomb mode buys scan DEPTH, not more votes.
const VOTERS = 1

const LENSES = [
  {
    key: 'in-function',
    brief: [
      'Read individual function bodies and judge each one on its own terms.',
      'Hunt: off-by-one and boundary errors; a condition with the wrong operator or',
      'inverted polarity; null/undefined reaching a dereference; a missing `await`',
      'or a promise never awaited; an early return or `continue` that skips required',
      'cleanup; a caught error that is swallowed and turns a failure into a silent',
      'wrong answer; an unchecked index or map lookup; a mutable default or shared',
      'object mutated in place; integer/float or string/number coercion that changes',
      'the result; a resource (file handle, lock, subscription, transaction) not',
      'released on the throw path.',
    ].join(' '),
  },
  {
    key: 'in-module',
    brief: [
      'Read the module as a whole and judge how its own functions compose.',
      'Hunt: an invariant one function establishes and another breaks; a state',
      'machine with an unhandled transition; a cache written in one place and',
      'invalidated in another that no longer matches; two code paths that were',
      'copied and then diverged so only one got a fix; an ordering assumption',
      'between exported entry points that nothing enforces; error handling that is',
      'complete in one arm of a call chain and absent in the sibling arm; a branch',
      'that is unreachable and is masking the path that actually runs.',
    ].join(' '),
  },
  {
    key: 'in-library',
    brief: [
      'Read the module boundary — its public surface and the code on both sides of',
      'it. Hunt: a contract mismatch between what the module promises and what its',
      'callers assume (nullability, ordering, units, mutation, throw-vs-return);',
      'semantics that drifted in a refactor while the signature stayed put;',
      'misuse of a third-party dependency against its documented contract; an',
      'assumption about a peer module that its current code no longer honours;',
      'reentrancy or concurrency hazards at the boundary; error values or types that',
      'do not survive the crossing (a typed error flattened to a string, a rejection',
      'converted to a resolved undefined).',
    ].join(' '),
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'line',
          'altitude',
          'title',
          'why',
          'failureScenario',
          'severity',
          'reachableToday',
        ],
        properties: {
          file: { type: 'string', description: 'repo-relative path' },
          line: { type: 'integer', description: '1-indexed line the defect anchors to' },
          altitude: { type: 'string', enum: ['in-function', 'in-module', 'in-library'] },
          title: { type: 'string', description: 'one short line naming the defect' },
          why: {
            type: 'string',
            description: 'the mechanism — what the code does vs what it must do',
          },
          failureScenario: {
            type: 'string',
            description: 'concrete inputs or state that produce the wrong output or crash',
          },
          severity: {
            type: 'string',
            enum: ['crash', 'data-loss', 'wrong-result', 'resource-leak', 'latent'],
          },
          reachableToday: {
            type: 'string',
            enum: ['yes', 'only-for-consumers', 'no'],
            description:
              'yes = a code path in this repo hits it now; only-for-consumers = the public API exposes it but no in-repo caller does; no = unreachable',
          },
          fixSketch: { type: 'string', description: 'the smallest change that would correct it' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    evidence: { type: 'string', description: 'file:line backing the verdict' },
  },
}

const REFUTE_LENSES = BOMB
  ? [
      'REACHABILITY — can any real caller actually reach this code with the offending input? Walk the call graph inward. If every caller makes the input impossible, the finding is refuted.',
      'EXISTING GUARDS — is the defect already prevented upstream by a validator, a type, an assertion, a schema, or a caller-side check? Go look. If it is guarded, the finding is refuted.',
      'REPRODUCTION — write out the exact sequence that produces the wrong behaviour, and check it against the current source line by line. If you cannot make it reproduce, the finding is refuted.',
    ]
  : [
      'Walk the call graph, the existing guards, and the tests. If any of them already prevent this, the finding is refuted.',
    ]

function key(f) {
  return `${f.file}:${f.line}:${String(f.title || '')
    .slice(0, 48)
    .toLowerCase()}`
}

function scanPrompt(t, lens, round, seenTitles) {
  return [
    `You are hunting real bugs in one territory of a large codebase. Territory: ${t.name} (id \`${t.id}\`).`,
    `Files in scope (do not read outside them except to check a caller or a contract):`,
    t.paths.map((p) => `  - ${p}`).join('\n'),
    t.note ? `Territory note: ${t.note}` : '',
    '',
    `ALTITUDE: ${lens.key}. ${lens.brief}`,
    '',
    'Method: search and read the actual source. Never report a defect you have not read the' +
      ' surrounding lines of. Before reporting, check the obvious refutations yourself —' +
      ' is it guarded upstream, is it dead code, is there a test that pins the current behaviour?' +
      ' Drop anything you cannot make fail.',
    '',
    `RUN A REPRO WHEN YOU CAN — an executed failure is worth more than any amount of` +
      ` reading, and it is what separates a real defect from a plausible story. But` +
      ` the repo tree is READ-ONLY: never create, edit or delete a file inside it.` +
      ` Write every scratch file under ${SCRATCH} instead, import the real module` +
      ` from its absolute path, and delete what you wrote when you are done. A repro` +
      ` file left in the repo becomes someone else's mystery diff.`,
    '',
    'DO NOT report: style, naming, formatting, missing tests, missing docs, "could be' +
      ' refactored", performance without a correctness consequence, or a TODO someone' +
      ' already wrote down. Only defects where the code produces a wrong result, crashes,' +
      ' leaks, corrupts state, or violates a contract it is depended on for.',
    round > 1
      ? `This is round ${round}. Findings already reported (do not repeat them; go somewhere new in the territory):\n${seenTitles.map((s) => `  - ${s}`).join('\n') || '  (none)'}`
      : '',
    '',
    'For every finding, walk the call graph INWARD before you report it and set' +
      ' `reachableToday`: `yes` if a code path in this repo reaches the defect now,' +
      " `only-for-consumers` if the package's public API exposes it but no in-repo" +
      ' caller does, `no` if no caller can reach it. This is the field that decides' +
      ' whether the finding is worth a PR, so do the walk — do not guess.',
    '',
    'Return the findings. An empty list is a correct and expected answer.',
  ]
    .filter(Boolean)
    .join('\n')
}

function refutePrompt(t, f, lensText, i) {
  return [
    'You are a skeptic. Your job is to REFUTE the claim below, not to confirm it.',
    `Territory: ${t.name}. Claim ${i + 1}:`,
    `  file: ${f.file}:${f.line}`,
    `  title: ${f.title}`,
    `  mechanism: ${f.why}`,
    `  claimed failure: ${f.failureScenario}`,
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
  ].join('\n')
}

async function scanTerritory(t) {
  const seen = new Set()
  // A territory may carry `known: ["file:line — title", …]` — what earlier runs
  // already found and shipped. Seeding the exclusion list with it is what makes
  // a SECOND sweep of already-swept ground worth running: without it the early
  // rounds spend themselves re-reporting fixed bugs, and the deep rounds never
  // get reached. Titles only; the dedupe key below stays file:line so a genuine
  // second defect on a line already fixed can still surface.
  const seenTitles = [...(t.known || [])]
  const candidates = []
  let dry = 0
  let round = 0
  while (dry < DRY_ROUNDS && round < MAX_ROUNDS) {
    round += 1
    const batches = await parallel(
      LENSES.map(
        (lens) => () =>
          agent(scanPrompt(t, lens, round, seenTitles), {
            label: `scan:${t.id}:${lens.key}:r${round}`,
            phase: 'Scan',
            schema: FINDINGS_SCHEMA,
            effort: BOMB ? 'high' : 'medium',
          }),
      ),
    )
    const found = batches.filter(Boolean).flatMap((b) => b.findings || [])
    const fresh = []
    for (const f of found) {
      const k = key(f)
      if (seen.has(k)) continue
      seen.add(k)
      seenTitles.push(`${f.file}:${f.line} — ${f.title}`)
      fresh.push(f)
    }
    if (fresh.length === 0) {
      dry += 1
      continue
    }
    dry = 0
    candidates.push(...fresh)
  }
  if (round >= MAX_ROUNDS && dry < DRY_ROUNDS) {
    log(
      `${t.id}: hit the ${MAX_ROUNDS}-round scan cap before going dry — coverage of this territory is incomplete`,
    )
  }
  return { territory: t, candidates }
}

async function validateTerritory(prev) {
  const t = prev.territory
  const candidates = prev.candidates
  if (candidates.length === 0) return { territory: t, confirmed: [], unvalidated: [], scanned: 0 }
  const judged = await parallel(
    candidates.map(
      (f, i) => () =>
        parallel(
          REFUTE_LENSES.slice(0, VOTERS).map(
            (lensText) => () =>
              agent(refutePrompt(t, f, lensText, i), {
                label: `validate:${t.id}:${f.file}:${f.line}`,
                phase: 'Validate',
                schema: VERDICT_SCHEMA,
                effort: 'high',
              }),
          ),
        ).then((votes) => {
          const cast = votes.filter(Boolean)
          const standing = cast.filter((v) => !v.refuted).length
          return {
            finding: f,
            // No verdict at all is NOT a refutation — see `unvalidated` below.
            validated: cast.length > 0,
            survives: cast.length > 0 && standing * 2 > cast.length,
            verdicts: cast,
          }
        }),
    ),
  )
  // A candidate every voter failed on (rate limit, API error, user skip) is
  // unjudged, not killed. Reporting it as refuted would turn an outage into a
  // clean bill of health, so it rides back out in its own bucket.
  const confirmed = []
  const unvalidated = []
  judged.forEach((j, i) => {
    const f = { ...candidates[i], territoryId: t.id }
    if (!j || !j.validated) unvalidated.push(f)
    else if (j.survives) confirmed.push(f)
  })
  if (unvalidated.length > 0) {
    log(
      `${t.id}: ${unvalidated.length}/${candidates.length} candidate(s) UNVALIDATED — every refuter failed; not a clean result`,
    )
  }
  log(`${t.id}: ${confirmed.length}/${candidates.length} candidates survived validation`)
  return { territory: t, confirmed, unvalidated, scanned: candidates.length }
}

if (TERRITORIES.length === 0) {
  log('no territories supplied — nothing to scan')
  return { territories: [] }
}

log(
  `${TERRITORIES.length} territories, mode=${BOMB ? 'bomb' : 'normal'}, ${VOTERS} refuter(s) per candidate`,
)

const results = await pipeline(TERRITORIES, scanTerritory, validateTerritory)

return {
  mode: BOMB ? 'bomb' : 'normal',
  territories: results.filter(Boolean).map((r) => ({
    id: r.territory.id,
    name: r.territory.name,
    paths: r.territory.paths,
    scanned: r.scanned,
    confirmed: r.confirmed,
    unvalidated: r.unvalidated,
  })),
}
