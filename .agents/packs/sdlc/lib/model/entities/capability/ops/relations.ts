/**
 * `sdlc capability relations <id>` — which milestones deliver one capability
 * and what is still open in them.
 *
 * The links exist only as forward references: a milestone lists capabilities
 * in `capabilities` and its tasks in `tasks`; a task has no milestone field,
 * so a task reaches a capability only through a milestone's `tasks` list.
 * This op inverts `capabilities` once (`buildEdges` reverse edges over the
 * milestone basenames) and resolves each listed milestone's `tasks`.
 *
 * Only direct links count: a milestone listing a child capability is not
 * rolled up into the parent, and `contains` is the direct children by
 * `parent_key` only. "Open task" is a listed task whose `state_group` is not
 * `closed`, so drafts (`planning/*`) are included on purpose.
 *
 * Pure function over the files on disk, no cache. The dashboard's
 * `GET /api/capabilities/:id/relations` calls {@link buildCapabilityRelations}
 * directly.
 */

import { join } from 'node:path'

import { z } from 'zod'

import { buildEdges, loadCorpus, resolveTarget } from '@lib/model/corpus'
import { extractTitle, scanEntityDir } from '@lib/model/read'
import { OpError, defineOp, type OpIo } from '@lib/registry'
import { cmpStr } from '@lib/util/strings'
import { unwrapWikilink } from '@lib/util/wikilinks'

import { buildCapabilityGraph } from './graph.ts'

export const CapabilityRef = z
  .object({
    id: z.string(),
    basename: z.string(),
    title: z.string(),
    kind: z.string().nullable(),
    state: z.string(),
    state_group: z.string(),
  })
  .meta({ id: 'CapabilityRef' })

export const TaskRef = z
  .object({
    id: z.string(),
    basename: z.string(),
    title: z.string(),
    state: z.string(),
    state_group: z.string(),
  })
  .meta({ id: 'TaskRef' })

export const MilestoneRelation = z
  .object({
    id: z.string(),
    basename: z.string(),
    title: z.string(),
    state: z.string(),
    state_group: z.string(),
    /** Tasks in the milestone's `tasks` list that resolve to a task file. */
    task_total: z.number(),
    /** Those whose `state_group` is not `closed`. */
    open_task_total: z.number(),
    open_tasks: z.array(TaskRef),
  })
  .meta({ id: 'MilestoneRelation' })

export const CapabilityRelations = z
  .object({
    capability: CapabilityRef,
    /** Direct children by `parent_key`, sorted by id. */
    contains: z.array(CapabilityRef),
    /** Milestones whose `capabilities` lists it, any state, sorted by id. */
    milestones: z.array(MilestoneRelation),
  })
  .meta({ id: 'CapabilityRelations' })

export type CapabilityRef = z.infer<typeof CapabilityRef>
export type TaskRef = z.infer<typeof TaskRef>
export type MilestoneRelation = z.infer<typeof MilestoneRelation>
export type CapabilityRelations = z.infer<typeof CapabilityRelations>

/** The slash-prefix of `state`, `'unknown'` when empty (same rule as the
 *  dashboard rows and `roadmap progress`). */
function stateGroupOf(state: string): string {
  return state === '' ? 'unknown' : state.split('/', 1)[0]!
}

function strOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function linkTarget(raw: string): string {
  return unwrapWikilink(raw) ?? raw
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

interface Row {
  basename: string
  fm: Record<string, unknown>
  text: string
}

function rowsOf(planningDir: string, dir: string): Map<string, Row> {
  const rows = new Map<string, Row>()
  for (const r of scanEntityDir(join(planningDir, dir), { withText: true })) {
    rows.set(r.basename, { basename: r.basename, fm: r.fm ?? {}, text: r.text ?? '' })
  }
  return rows
}

function titleOf(row: Row): string {
  return (
    strOf(row.fm['title']) ?? strOf(row.fm['headline']) ?? extractTitle(row.text) ?? row.basename
  )
}

function idOf(row: Row): string {
  return strOf(row.fm['id']) ?? row.basename
}

/**
 * Throws `OpError('INVALID_INPUT')` when `id` (an id or a basename) is not a
 * capability in the project.
 */
export function buildCapabilityRelations(root: string, id: string): CapabilityRelations {
  const planningDir = join(root, 'docs', 'planning')
  const graph = buildCapabilityGraph(root)
  const real = graph.nodes.filter((n) => !n.ghost)
  const node = real.find((n) => n.id === id) ?? real.find((n) => n.basename === id)
  if (node === undefined) {
    throw new OpError('INVALID_INPUT', `not a capability: ${id}`)
  }

  const ref = (n: (typeof real)[number]): CapabilityRef => ({
    id: n.id,
    basename: n.basename,
    title: n.title ?? n.id,
    kind: n.kind,
    state: n.state,
    state_group: n.state_group,
  })

  const contains = real
    .filter((n) => n.parent === node.id)
    .sort((a, b) => cmpStr(a.id, b.id))
    .map(ref)

  const corpus = loadCorpus(planningDir)
  const basenames = new Set(corpus.keys())
  const milestoneRows = rowsOf(planningDir, 'milestones')
  const taskRows = rowsOf(planningDir, 'tasks')

  const { reverseEdges } = buildEdges({
    nodes: milestoneRows.keys(),
    targetsOf: (m) => listOf(milestoneRows.get(m)?.fm['capabilities']),
    resolve: (raw) => resolveTarget(linkTarget(raw), basenames),
  })

  const milestones: MilestoneRelation[] = []
  for (const mBase of reverseEdges.get(node.basename) ?? []) {
    const row = milestoneRows.get(mBase)
    if (row === undefined) continue
    const state = strOf(row.fm['state']) ?? ''
    const seen = new Set<string>()
    const open: TaskRef[] = []
    let total = 0
    for (const raw of listOf(row.fm['tasks'])) {
      const resolved = resolveTarget(linkTarget(raw), basenames)
      if (resolved === null || seen.has(resolved)) continue
      seen.add(resolved)
      const task = taskRows.get(resolved)
      if (task === undefined || corpus.get(resolved)?.type !== 'task') continue
      total += 1
      const tState = strOf(task.fm['state']) ?? ''
      const group = stateGroupOf(tState)
      if (group === 'closed') continue
      open.push({
        id: idOf(task),
        basename: task.basename,
        title: titleOf(task),
        state: tState,
        state_group: group,
      })
    }
    open.sort((a, b) => cmpStr(a.id, b.id))
    milestones.push({
      id: idOf(row),
      basename: row.basename,
      title: titleOf(row),
      state,
      state_group: stateGroupOf(state),
      task_total: total,
      open_task_total: open.length,
      open_tasks: open,
    })
  }
  milestones.sort((a, b) => cmpStr(a.id, b.id))

  return { capability: ref(node), contains, milestones }
}

function render(out: CapabilityRelations, io: OpIo): number {
  const c = out.capability
  io.stdout(`${c.id} ${c.title} [${c.state || 'unknown'}]\n`)
  io.stdout(`contains:${out.contains.length === 0 ? ' (none)' : ''}\n`)
  for (const k of out.contains) io.stdout(`  ${k.id} ${k.title} [${k.state || 'unknown'}]\n`)
  io.stdout(`milestones:${out.milestones.length === 0 ? ' (none)' : ''}\n`)
  for (const m of out.milestones) {
    io.stdout(
      `  ${m.id} ${m.title} [${m.state || 'unknown'}] open tasks ${m.open_task_total}/${m.task_total}\n`,
    )
    for (const t of m.open_tasks) io.stdout(`    ${t.id} ${t.title} [${t.state || 'unknown'}]\n`)
  }
  return 0
}

export default defineOp({
  path: ['capability', 'relations'],
  summary: 'The milestones that list a capability, their open tasks, and its direct children.',
  // Read-only: reads capability, milestone and task files; writes nothing.
  mutating: false,
  input: z.object({
    /** A capability id (`C-0063`) or basename. */
    id: z.string(),
  }),
  output: CapabilityRelations,
  cli: { positionals: ['id'], render },
  handler: (args, ctx) => buildCapabilityRelations(ctx.projectRoot, args.id),
})
