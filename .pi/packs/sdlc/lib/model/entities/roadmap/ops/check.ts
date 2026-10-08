/**
 * `roadmap check` op ([[D-0007-deterministic-op-substrate]] §2a) — validate
 * one roadmap (or every roadmap under `docs/planning/roadmaps/` when no `id`
 * is given) against the milestone corpus it links to. Templated on
 * `lib/model/ops/audit.ts`'s "load corpus, walk cross-references, report
 * findings, exit non-zero on serious findings" shape, scoped to the
 * roadmap↔milestone↔task cross-reference graph rather than the whole
 * schema/body drift surface `entities audit` covers.
 *
 * A roadmap's version sections (`## v0.4.0`, …) and any other top-level H2
 * that carries milestone links (e.g. a `## Pre-release` phase-0 section
 * ahead of the first versioned release) are free-form H2s carrying milestone
 * wikilinks in a bullet list (see `../schema.ts`'s design-choice note and
 * `../body-template.eta`); this op is where that body structure actually
 * gets validated, since `RoadmapContract`'s body grammar deliberately leaves
 * those sections unenumerated. Every top-level H2 is scanned for milestone
 * wikilinks — the section's heading spelling doesn't matter, only whether it
 * contains links to milestones.
 *
 * Exactly four milestone/task consistency rules are implemented (nothing broader — no
 * "is this version shipped" reconciliation, which needs a documented
 * mapping from milestone state to "shipped" this brief left undefined):
 *
 *   (a) `missing_milestone`   — a milestone wikilink in a top-level section
 *       does not resolve to an existing milestone file.
 *   (b) `missing_task`        — a resolved milestone's own `tasks:`
 *       frontmatter names an entry that does not resolve to an existing
 *       entity file (a Task, per `milestone/schema.ts`'s primary contract
 *       for this field, or another entity by id, which that same field
 *       also documents as legitimate).
 *   (c) `duplicate_milestone` — the same milestone is linked from two (or
 *       more) DIFFERENT top-level sections in the same roadmap.
 *   (d) `stale_milestone_link` — a resolved milestone is `closed/abandoned`
 *       or `closed/superseded`, but the roadmap's list item linking it
 *       carries no note (no text beyond the bare wikilink) explaining why
 *       it is still listed.
 *
 * Plus `missing_capability` — a resolved milestone's `capabilities:` entry
 * does not resolve to an existing capability file (the milestone-to-capability
 * link used for planning on the capability graph) — and `missing_plan_note` —
 * the roadmap's `plan_doc` does not resolve to an existing Note file — and one
 * defensive, non-brief-mandated finding: `invalid_roadmap`, when
 * the roadmap file itself fails its own frontmatter/body contract — the
 * body is still walked best-effort (the raw text is available either way),
 * so a roadmap with drifted frontmatter still gets its cross-reference
 * findings.
 *
 * With `--strict-order` it also runs the ordered-flow rules in `../order.ts`
 * (`unroadmapped_milestone`, `version_section_mismatch`,
 * `task_without_milestone`); each finding message ends with its remedy.
 *
 * Never hand-rolls entity reading: milestone/task existence and state come
 * from the shared corpus loader + `resolveTarget` (`@lib/model/corpus`, the
 * same seam `entities audit`'s `depends_on` check uses) and
 * `readRawFrontmatter` (the bulk fm-only primitive `lib/model/read.ts`
 * documents for exactly this kind of scan); the roadmap file itself is read
 * through `readEntity`.
 */

import { join, relative } from 'node:path'

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import type { OpIo } from '@lib/registry'
import { cmpStr } from '@lib/util/strings'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { loadCorpus, resolveTarget } from '@lib/model/corpus'
import type { CorpusEntry } from '@lib/model/corpus'
import { readEntity, readRawFrontmatter } from '@lib/model/read'
import type { EntityReadResult } from '@lib/model/read'

import { checkCorpusOrder, checkVersionSections } from '../order'
import { resolveRoadmapPaths, scanTopLevelMilestoneLinks } from '../sections'
import type { MilestoneLinkOccurrence } from '../sections'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const FINDING_KINDS = [
  'missing_milestone',
  'missing_task',
  'missing_capability',
  'duplicate_milestone',
  'stale_milestone_link',
  'missing_plan_note',
  'invalid_roadmap',
  // Ordered-flow rules, `--strict-order` only (see ../order.ts).
  'unroadmapped_milestone',
  'version_section_mismatch',
  'task_without_milestone',
] as const

export const RoadmapCheckFinding = z.object({
  /** The roadmap this finding is about (its `id`, or its basename when the
   *  roadmap's own frontmatter is unreadable); for the corpus-wide
   *  `unroadmapped_milestone` / `task_without_milestone` rules, the
   *  milestone or task basename the finding names. */
  id: z.string(),
  kind: z.enum(FINDING_KINDS),
  message: z.string(),
  /** `<relative-path>[:<line>]`. */
  location: z.string(),
})
export type RoadmapCheckFinding = z.infer<typeof RoadmapCheckFinding>

// ---------------------------------------------------------------------------
// Body scan — extracting milestone links from top-level sections. The scan
// itself (`scanTopLevelMilestoneLinks`) is shared with `./progress.ts` via
// `../sections`; what follows here is check.ts's own use of it.
// ---------------------------------------------------------------------------

/** The list item's text with every wikilink stripped and leading/trailing
 *  connector punctuation trimmed — `""` means "carries no note". */
function noteText(itemText: string): string {
  return itemText
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Per-roadmap check
// ---------------------------------------------------------------------------

/** Contract validation — the roadmap file itself must pass its own
 *  frontmatter/body contract. Defensive, non-brief-mandated: the body is
 *  still walked best-effort either way (see module docstring). */
function checkContract(
  res: EntityReadResult,
  roadmapId: string,
  relPath: string,
): RoadmapCheckFinding[] {
  if (res.ok) return []
  return [
    {
      id: roadmapId,
      kind: 'invalid_roadmap',
      message: `roadmap failed its contract: ${res.findings.map((f) => f.message).join('; ')}`,
      location: relPath,
    },
  ]
}

/** (a) `missing_milestone` — a milestone wikilink in a top-level section does
 *  not resolve to an existing milestone file. */
function checkMissingMilestones(
  occurrences: MilestoneLinkOccurrence[],
  roadmapId: string,
  relPath: string,
): RoadmapCheckFinding[] {
  const findings: RoadmapCheckFinding[] = []
  for (const occ of occurrences) {
    if (occ.resolved === null) {
      findings.push({
        id: roadmapId,
        kind: 'missing_milestone',
        message: `section "${occ.sectionName}" links milestone ${occ.target}, which does not resolve to an existing milestone file`,
        location: `${relPath}:${occ.line}`,
      })
    }
  }
  return findings
}

/** Every resolved milestone linked from a roadmap, mapped to the distinct
 *  top-level section names that link it (version sections and any other
 *  top-level H2, e.g. `## Pre-release`). Shared by the duplicate-link check
 *  (c) and the missing-task check (b), which both key off "which milestones
 *  does this roadmap resolve to". */
function groupByResolvedMilestone(
  occurrences: MilestoneLinkOccurrence[],
): Map<string, Set<string>> {
  const sectionsByMilestone = new Map<string, Set<string>>()
  for (const occ of occurrences) {
    if (occ.resolved === null) continue
    let set = sectionsByMilestone.get(occ.resolved)
    if (set === undefined) {
      set = new Set()
      sectionsByMilestone.set(occ.resolved, set)
    }
    set.add(occ.sectionName)
  }
  return sectionsByMilestone
}

/** (c) `duplicate_milestone` — the same milestone is linked from two (or
 *  more) DIFFERENT top-level sections in the same roadmap. */
function checkDuplicateMilestones(
  sectionsByMilestone: Map<string, Set<string>>,
  roadmapId: string,
  relPath: string,
): RoadmapCheckFinding[] {
  const findings: RoadmapCheckFinding[] = []
  for (const [basename, sections] of sectionsByMilestone) {
    if (sections.size > 1) {
      findings.push({
        id: roadmapId,
        kind: 'duplicate_milestone',
        message: `milestone ${basename} is linked from ${sections.size} different sections: ${[...sections].sort(cmpStr).join(', ')}`,
        location: relPath,
      })
    }
  }
  return findings
}

/** (d) `stale_milestone_link` — a resolved milestone is `closed/abandoned`
 *  or `closed/superseded`, but the roadmap's list item linking it carries no
 *  note explaining why it is still listed. Checked per OCCURRENCE, since
 *  "carries a note" is a property of that specific list item, not of the
 *  milestone overall. */
function checkStaleMilestoneLinks(
  occurrences: MilestoneLinkOccurrence[],
  planningRoot: string,
  roadmapId: string,
  relPath: string,
): RoadmapCheckFinding[] {
  const findings: RoadmapCheckFinding[] = []
  for (const occ of occurrences) {
    if (occ.resolved === null) continue
    const milestonePath = join(planningRoot, 'milestones', `${occ.resolved}.md`)
    const fm = readRawFrontmatter(milestonePath)
    const state = fm !== null && typeof fm['state'] === 'string' ? fm['state'] : undefined
    if (state === 'closed/abandoned' || state === 'closed/superseded') {
      if (noteText(occ.itemText) === '') {
        findings.push({
          id: roadmapId,
          kind: 'stale_milestone_link',
          message: `milestone ${occ.resolved} is ${state} but is still linked from section "${occ.sectionName}" with no note explaining why`,
          location: `${relPath}:${occ.line}`,
        })
      }
    }
  }
  return findings
}

/** (b) `missing_task` — a resolved milestone's own `tasks:` frontmatter
 *  names an entry that does not resolve to any existing entity file.
 *  `milestone/schema.ts`'s `tasks` field is documented as accepting "a
 *  wikilink to a Task ... or another entity by id", so this resolves
 *  against `corpusBasenames` (the WHOLE entity corpus), not just the
 *  task-typed subset — a `tasks:` entry that names an existing non-task
 *  entity (a decision, a milestone, …) is a legitimate cross-entity
 *  dependency per that contract and must NOT be reported here. Checked
 *  once per uniquely-resolved milestone (a duplicate link to the same
 *  milestone would otherwise repeat every one of its findings). */
function checkMissingTasks(
  sectionsByMilestone: Map<string, Set<string>>,
  projectRoot: string,
  planningRoot: string,
  corpusBasenames: Set<string>,
  roadmapId: string,
): RoadmapCheckFinding[] {
  const findings: RoadmapCheckFinding[] = []
  const uniqueMilestones = [...sectionsByMilestone.keys()].sort(cmpStr)
  for (const basename of uniqueMilestones) {
    const milestonePath = join(planningRoot, 'milestones', `${basename}.md`)
    const fm = readRawFrontmatter(milestonePath)
    const tasks = fm !== null && Array.isArray(fm['tasks']) ? fm['tasks'] : []
    for (const raw of tasks) {
      if (typeof raw !== 'string') continue
      const target = unwrapWikilink(raw) ?? raw
      if (resolveTarget(target, corpusBasenames) === null) {
        findings.push({
          id: roadmapId,
          kind: 'missing_task',
          message: `milestone ${basename} (linked from this roadmap) names ${target} in its tasks:, which does not resolve to an existing task or other entity file`,
          location: relative(projectRoot, milestonePath),
        })
      }
    }
  }
  return findings
}

/** `missing_capability` — a resolved milestone's `capabilities:` entry must
 *  resolve to an existing capability file (unlike `tasks:`, the field is
 *  capability-only, so a non-capability target is also a finding). */
function checkMissingCapabilities(
  sectionsByMilestone: Map<string, Set<string>>,
  projectRoot: string,
  planningRoot: string,
  corpus: ReadonlyMap<string, { type: string }>,
  roadmapId: string,
): RoadmapCheckFinding[] {
  const findings: RoadmapCheckFinding[] = []
  const names = new Set(corpus.keys())
  for (const basename of [...sectionsByMilestone.keys()].sort(cmpStr)) {
    const milestonePath = join(planningRoot, 'milestones', `${basename}.md`)
    const fm = readRawFrontmatter(milestonePath)
    const caps = fm !== null && Array.isArray(fm['capabilities']) ? fm['capabilities'] : []
    for (const raw of caps) {
      if (typeof raw !== 'string') continue
      const target = unwrapWikilink(raw) ?? raw
      const resolved = resolveTarget(target, names)
      if (resolved === null || corpus.get(resolved)?.type !== 'capability') {
        findings.push({
          id: roadmapId,
          kind: 'missing_capability',
          message: `milestone ${basename} (linked from this roadmap) names ${target} in its capabilities:, which does not resolve to an existing capability file`,
          location: relative(projectRoot, milestonePath),
        })
      }
    }
  }
  return findings
}

/** `missing_plan_note` — `plan_doc` must resolve to an existing Note file. */
function checkPlanNote(
  fm: Record<string, unknown> | null,
  corpus: ReadonlyMap<string, { type: string }>,
  roadmapId: string,
  relPath: string,
): RoadmapCheckFinding[] {
  const raw = fm !== null ? fm['plan_doc'] : undefined
  if (typeof raw !== 'string') return [] // absent/malformed: `invalid_roadmap` covers it
  const target = unwrapWikilink(raw) ?? raw
  const resolved = resolveTarget(target, new Set(corpus.keys()))
  if (resolved !== null && corpus.get(resolved)?.type === 'note') return []
  return [
    {
      id: roadmapId,
      kind: 'missing_plan_note',
      message: `plan_doc ${target} does not resolve to an existing note file`,
      location: relPath,
    },
  ]
}

/** Thin orchestrator: read the roadmap, validate its own contract, scan its
 *  top-level sections for milestone links, then run the four lettered
 *  cross-reference checks (a-d) against those links plus the plan-note check
 *  (`checkPlanNote`), aggregating every finding. */
function checkOneRoadmap(
  path: string,
  projectRoot: string,
  planningRoot: string,
  corpus: ReadonlyMap<string, CorpusEntry>,
  strictOrder: boolean,
): RoadmapCheckFinding[] {
  const relPath = relative(projectRoot, path)
  const corpusBasenames = new Set(corpus.keys())

  const res = readEntity('roadmap', path, { projectRoot })
  if (res === null) return [] // vanished between listing and read; nothing to report

  const roadmapId =
    res.fm !== null && typeof res.fm['id'] === 'string' ? (res.fm['id'] as string) : relPath

  const occurrences = scanTopLevelMilestoneLinks(res.text, corpusBasenames)
  const sectionsByMilestone = groupByResolvedMilestone(occurrences)

  return [
    ...checkContract(res, roadmapId, relPath),
    ...checkPlanNote(res.fm, corpus, roadmapId, relPath),
    ...checkMissingMilestones(occurrences, roadmapId, relPath),
    ...checkDuplicateMilestones(sectionsByMilestone, roadmapId, relPath),
    ...checkStaleMilestoneLinks(occurrences, planningRoot, roadmapId, relPath),
    ...checkMissingTasks(
      sectionsByMilestone,
      projectRoot,
      planningRoot,
      corpusBasenames,
      roadmapId,
    ),
    ...checkMissingCapabilities(sectionsByMilestone, projectRoot, planningRoot, corpus, roadmapId),
    ...(strictOrder ? checkVersionSections(occurrences, planningRoot, roadmapId, relPath) : []),
  ]
}

/** The corpus-wide ordered-flow findings: gathers every milestone any of
 *  `roadmapPaths` links, then hands off to `checkCorpusOrder`. */
function corpusOrderFindings(
  roadmapPaths: string[],
  projectRoot: string,
  planningRoot: string,
  corpus: ReadonlyMap<string, CorpusEntry>,
): RoadmapCheckFinding[] {
  const names = new Set(corpus.keys())
  const linked = new Set<string>()
  for (const path of roadmapPaths) {
    const res = readEntity('roadmap', path, { projectRoot })
    if (res === null) continue
    for (const occ of scanTopLevelMilestoneLinks(res.text, names)) {
      if (occ.resolved !== null) linked.add(occ.resolved)
    }
  }
  return checkCorpusOrder(linked, corpus, planningRoot, projectRoot)
}

// ---------------------------------------------------------------------------
// The op descriptor
// ---------------------------------------------------------------------------

const input = z.object({
  projectRoot: z.string(),
  /** A specific roadmap (path / project-relative path / bare id or
   *  basename). Every roadmap under `docs/planning/roadmaps/` when omitted. */
  id: z.string().optional(),
  /** Also run the ordered-flow rules (`../order.ts`). Off by default so a
   *  corpus that predates them keeps passing. The corpus-wide rules run only
   *  when no `id` is given: "on no roadmap" needs every roadmap. */
  strictOrder: z.boolean().default(false),
})

const output = z.object({
  serious: z.boolean(),
  roadmaps_checked: z.number(),
  findings: z.array(RoadmapCheckFinding),
})

function renderCheck(out: z.infer<typeof output>, io: OpIo): number {
  io.stdout(`Checked ${out.roadmaps_checked} roadmap(s); ${out.findings.length} finding(s).\n`)
  for (const f of out.findings) {
    io.stdout(`- [${f.kind}] ${f.location}: ${f.message}\n`)
  }
  return out.serious ? 1 : 0
}

export default defineOp({
  path: ['roadmap', 'check'],
  summary: 'Validate a roadmap (or every roadmap) against the milestone/task corpus it links to.',
  // Read-only: reads roadmap/milestone/task files and reports findings; never
  // writes.
  mutating: false,
  input,
  output,
  cli: {
    positionals: ['id'],
    flags: {
      strictOrder: {
        help: 'Also report ordered-flow findings: open milestones on no roadmap (and not tagged deferred), milestone version vs section heading, open tasks claimed by no open milestone. The first and third run only when no roadmap id is given.',
      },
    },
    render: renderCheck,
  },
  handler: (args, ctx) => {
    const planningRoot = join(ctx.projectRoot, 'docs', 'planning')
    const paths = resolveRoadmapPaths(ctx.projectRoot, planningRoot, args.id)

    const corpus = loadCorpus(planningRoot)

    const findings: RoadmapCheckFinding[] = []
    for (const path of paths) {
      findings.push(
        ...checkOneRoadmap(path, ctx.projectRoot, planningRoot, corpus, args.strictOrder),
      )
    }
    if (args.strictOrder && args.id === undefined) {
      findings.push(...corpusOrderFindings(paths, ctx.projectRoot, planningRoot, corpus))
    }

    return {
      serious: findings.length > 0,
      roadmaps_checked: paths.length,
      findings,
    }
  },
})
