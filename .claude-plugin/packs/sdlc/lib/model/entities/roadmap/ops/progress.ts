/**
 * `roadmap progress` — for one roadmap (or every roadmap under
 * `docs/planning/roadmaps/` when no `id` is given), report each top-level
 * section's linked milestones with their `state`/`state_group`, and each of
 * those milestones' member tasks' `state_group` counts.
 *
 * Companion to `./check.ts` (`roadmap check`), which validates the SAME
 * roadmap↔milestone↔task cross-reference structure but reports FINDINGS
 * (missing links, duplicates, staleness) rather than progress. This op walks
 * the same shape — top-level H2 sections carrying milestone wikilinks, each
 * resolved milestone's own `tasks:` frontmatter — but has no findings
 * vocabulary of its own: an unresolved milestone link or an unresolved task
 * reference is simply omitted from the progress report (`roadmap check`
 * already reports those as findings; duplicating that here would be a second,
 * divergent copy of the same validation). The section-walk and
 * wikilink-scanning primitive itself (`scanTopLevelMilestoneLinks`) is shared
 * with `check.ts` via `../sections` — a third module neither op owns, so
 * this op's own scan here is just deduping and dropping unresolved targets
 * on top of that shared primitive, not a second implementation of it.
 *
 * Task state is derived with the exact same one-line rule the dashboard's own
 * `TaskRow.state_group` uses (`lib/services/dashboard/server.ts`'s private
 * `stateGroup()`: the `state` value's slash-prefix, `'unknown'` when absent) —
 * so a milestone's task counts here agree with what the tasks panel shows
 * elsewhere in the dashboard. It is NOT imported from there: `server.ts`
 * itself imports `./contract.ts`, and `contract.ts` wraps this op's own
 * `output` schema (per the dashboard's DRY-reuse convention), so importing
 * `server.ts` from a `lib/model` op would close a real import cycle
 * (`contract.ts` → this file → `server.ts` → `contract.ts`) rather than a
 * merely apparent one — `@lib/model/corpus`'s `loadCorpus` (already loaded
 * once per call for `corpusBasenames`) is the shared, cycle-free primitive
 * both readers are already built on: its `{type, state}` per basename is
 * enough to derive a task's `state_group` with no second directory scan.
 */

import { join, relative } from 'node:path'

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import type { OpIo } from '@lib/registry'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { loadCorpus, resolveTarget } from '@lib/model/corpus'
import type { CorpusEntry } from '@lib/model/corpus'
import { readEntity, readRawFrontmatter } from '@lib/model/read'

import { resolveRoadmapPaths, scanTopLevelMilestoneLinks } from '../sections'

// ---------------------------------------------------------------------------
// Body scan — same wikilink-in-top-level-section shape `check.ts` scans,
// via the shared `scanTopLevelMilestoneLinks` (`../sections`); this op just
// dedupes and drops unresolved targets on top of it.
// ---------------------------------------------------------------------------

interface LinkOccurrence {
  sectionName: string
  resolved: string
}

/** Every milestone-wikilink occurrence under every top-level H2 section of
 *  `text`, in document order, deduped to one occurrence per (section, resolved
 *  milestone) pair — a milestone linked twice from the same section's bullet
 *  list still contributes one progress row, not two. */
function scanTopLevelSections(text: string, corpusBasenames: Set<string>): LinkOccurrence[] {
  const seen = new Set<string>()
  const occurrences: LinkOccurrence[] = []
  for (const occ of scanTopLevelMilestoneLinks(text, corpusBasenames)) {
    if (occ.resolved === null) continue // unresolved: `roadmap check` reports this, not this op
    const dedupeKey = `${occ.sectionName}\u0000${occ.resolved}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    occurrences.push({ sectionName: occ.sectionName, resolved: occ.resolved })
  }
  return occurrences
}

// ---------------------------------------------------------------------------
// Per-milestone task-progress rollup
// ---------------------------------------------------------------------------

/** `state` → `state_group`: the slash-prefix, `'unknown'` when absent — the
 *  same one-line rule `lib/services/dashboard/server.ts`'s private
 *  `stateGroup()` applies to every other dashboard row (see module doc for
 *  why that function is not imported directly). */
function stateGroupOf(state: unknown): string {
  if (typeof state !== 'string' || state === '') return 'unknown'
  return state.split('/', 1)[0]!
}

const milestoneProgressSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  state: z.string().nullable(),
  state_group: z.string(),
  /** Member tasks resolved from the milestone's own `tasks:` frontmatter
   *  that actually resolve to a row in the task corpus (a `tasks:` entry
   *  naming a non-task entity — legitimate per `milestone/schema.ts` — is
   *  counted in neither field, since it has no `state_group` to tally). */
  task_total: z.number(),
  task_state_counts: z.record(z.string(), z.number()),
})
export type MilestoneProgress = z.infer<typeof milestoneProgressSchema>

const sectionProgressSchema = z.object({
  section: z.string(),
  milestones: z.array(milestoneProgressSchema),
})
export type SectionProgress = z.infer<typeof sectionProgressSchema>

const roadmapProgressSchema = z.object({
  id: z.string(),
  path: z.string(),
  sections: z.array(sectionProgressSchema),
})
export type RoadmapProgress = z.infer<typeof roadmapProgressSchema>

export const output = z.object({
  roadmaps: z.array(roadmapProgressSchema),
})
export type Output = z.infer<typeof output>

/** One resolved milestone's progress row: its own state plus its tasks'. */
function milestoneProgressOf(
  basename: string,
  planningRoot: string,
  corpusBasenames: Set<string>,
  corpus: Map<string, CorpusEntry>,
): MilestoneProgress {
  const milestonePath = join(planningRoot, 'milestones', `${basename}.md`)
  const fm = readRawFrontmatter(milestonePath) ?? {}
  const state = typeof fm['state'] === 'string' ? fm['state'] : null
  // `MilestoneSchema` is `.strict()` with no `headline` field — `title` is
  // the only key that has ever existed here, so this reads it alone.
  const title = typeof fm['title'] === 'string' ? fm['title'] : null

  const taskRefs = Array.isArray(fm['tasks']) ? (fm['tasks'] as unknown[]) : []
  const taskCounts: Record<string, number> = {}
  let taskTotal = 0
  // A milestone's own `tasks:` list can name the same task twice under
  // different spellings (`[[T-0001]]` and `[[T-0001-slug]]` both resolve to
  // one basename) — dedupe by RESOLVED basename, not by the raw ref, or a
  // doubly-referenced task is double-counted in `task_total`.
  const seenTasks = new Set<string>()
  for (const raw of taskRefs) {
    if (typeof raw !== 'string') continue
    const target = unwrapWikilink(raw) ?? raw
    const resolved = resolveTarget(target, corpusBasenames)
    if (resolved === null) continue // unresolved: `roadmap check`'s missing_task finding covers this
    if (seenTasks.has(resolved)) continue
    seenTasks.add(resolved)
    const entry = corpus.get(resolved)
    if (entry === undefined || entry.type !== 'task') continue // resolves to a non-task entity — no state_group to tally
    const group = stateGroupOf(entry.state)
    taskCounts[group] = (taskCounts[group] ?? 0) + 1
    taskTotal += 1
  }

  return {
    id: (fm['id'] as string | undefined) ?? basename,
    title,
    state,
    state_group: stateGroupOf(state),
    task_total: taskTotal,
    task_state_counts: taskCounts,
  }
}

/** One roadmap's progress: every top-level section, each with its linked
 *  milestones' progress rows, in section/occurrence order. */
function roadmapProgressOf(
  path: string,
  projectRoot: string,
  planningRoot: string,
  corpusBasenames: Set<string>,
  corpus: Map<string, CorpusEntry>,
): RoadmapProgress {
  const relPath = relative(projectRoot, path)
  const res = readEntity('roadmap', path, { projectRoot })
  const roadmapId =
    res !== null && res.fm !== null && typeof res.fm['id'] === 'string'
      ? (res.fm['id'] as string)
      : relPath
  // A roadmap that fails its own contract is still walked best-effort — the
  // raw text is available either way (mirrors `check.ts`'s `checkContract`
  // note: this op has no findings vocabulary, so an invalid roadmap simply
  // contributes whatever its body scan can still find).
  const text = res?.text ?? ''

  const occurrences = scanTopLevelSections(text, corpusBasenames)
  const bySection = new Map<string, MilestoneProgress[]>()
  const order: string[] = []
  for (const occ of occurrences) {
    let list = bySection.get(occ.sectionName)
    if (list === undefined) {
      list = []
      bySection.set(occ.sectionName, list)
      order.push(occ.sectionName)
    }
    list.push(milestoneProgressOf(occ.resolved as string, planningRoot, corpusBasenames, corpus))
  }

  return {
    id: roadmapId,
    path: relPath,
    sections: order.map((section) => ({ section, milestones: bySection.get(section)! })),
  }
}

function renderProgress(out: Output, io: OpIo): number {
  for (const roadmap of out.roadmaps) {
    io.stdout(`${roadmap.id} (${roadmap.path})\n`)
    for (const section of roadmap.sections) {
      io.stdout(`  ${section.section}\n`)
      for (const m of section.milestones) {
        const counts = Object.entries(m.task_state_counts)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
        io.stdout(
          `    ${m.id} [${m.state ?? 'unknown'}] tasks=${m.task_total}${counts ? ` (${counts})` : ''}\n`,
        )
      }
    }
  }
  return 0
}

/**
 * The op's entire computation, minus the `defineOp` wrapper — callable
 * in-process by any caller that already has a project root, the same
 * convention `usage/ops/report.ts#runUsageReport` follows. The dashboard's
 * `GET /api/roadmap/progress` route (`lib/services/dashboard/server.ts`)
 * calls this directly rather than going through the full op-invocation
 * pipeline.
 */
export function runRoadmapProgress(projectRoot: string, id?: string): Output {
  const planningRoot = join(projectRoot, 'docs', 'planning')
  const paths = resolveRoadmapPaths(projectRoot, planningRoot, id)

  const corpus = loadCorpus(planningRoot)
  const corpusBasenames = new Set(corpus.keys())

  const roadmaps = paths.map((path) =>
    roadmapProgressOf(path, projectRoot, planningRoot, corpusBasenames, corpus),
  )

  return { roadmaps }
}

export default defineOp({
  path: ['roadmap', 'progress'],
  summary:
    "Report a roadmap's (or every roadmap's) linked milestones and their member tasks' state.",
  // Read-only: reads roadmap/milestone/task files and reports a rollup; never
  // writes.
  mutating: false,
  input: z.object({
    projectRoot: z.string(),
    /** A specific roadmap (path / project-relative path / bare id or
     *  basename). Every roadmap under `docs/planning/roadmaps/` when omitted. */
    id: z.string().optional(),
  }),
  output,
  cli: {
    positionals: ['id'],
    render: renderProgress,
  },
  handler: (args, ctx) => runRoadmapProgress(ctx.projectRoot, args.id),
})
