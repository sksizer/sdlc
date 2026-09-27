/**
 * `sdlc capability graph` — the capability corpus as one graph: containment
 * from `parent_key`, and `related` wikilinks as edges between capabilities.
 *
 * Read fail-safe from raw frontmatter, the way `loadCorpus` reads: a malformed
 * file is a warning, never a throw, because the consumer is a viewer and an
 * empty map reads as "no capabilities" rather than "one file is broken".
 *
 * A dangling `parent_key` becomes a GHOST node rather than a silent re-root,
 * so containment holds and the hole is visible. Every warning quotes the id
 * it is about in double quotes — that is how the system-graph viewer joins a
 * warning to its node.
 */

import { basename as pathBasename, join } from 'node:path'

import { z } from 'zod'

import { buildEdges, findCycles, loadCorpus, resolveTarget } from '@lib/model/corpus'
import { parseCanonicalFilename } from '@lib/model/identifier'
import { scanEntityDir } from '@lib/model/read'
import { defineOp, type OpIo } from '@lib/registry'
import { dirName, entityDirs } from '@lib/util/markdown_extract'
import { cmpStr } from '@lib/util/strings'
import { unwrapWikilink } from '@lib/util/wikilinks'

import { CapabilityEntity } from '../schema.ts'

export const CapabilityGraphNode = CapabilityEntity.extend({
  /** The segment before `/` in `status`: `open`, `closed`, or `unknown`. */
  status_group: z.string(),
  audience: z.string(),
  locations: z.array(z.string()),
  /** Resolved `related` targets as basenames, any entity type. */
  related: z.array(z.string()),
  tags: z.array(z.string()),
  /** Synthesized for a `parent_key` no file answers to. */
  ghost: z.boolean(),
}).meta({ id: 'CapabilityGraphNode' })

export const CapabilityGraphEdge = z
  .object({ from: z.string(), to: z.string(), kind: z.literal('related') })
  .meta({ id: 'CapabilityGraphEdge' })

export const CapabilityGraph = z
  .object({
    root: z.string(),
    root_label: z.string(),
    nodes: z.array(CapabilityGraphNode),
    edges: z.array(CapabilityGraphEdge),
    warnings: z.array(z.string()),
    /** Capability files read; ghosts are not counted. */
    scanned: z.number(),
  })
  .meta({ id: 'CapabilityGraph' })

export type CapabilityGraphNode = z.infer<typeof CapabilityGraphNode>
export type CapabilityGraphEdge = z.infer<typeof CapabilityGraphEdge>
export type CapabilityGraph = z.infer<typeof CapabilityGraph>

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return typeof value === 'string' ? [value] : []
}

/** `[[C-0001-slug]]` and bare `C-0001-slug` both name the same target. */
function linkTarget(value: string): string {
  return unwrapWikilink(value) ?? value
}

/** The id half of a basename: `C-D2GO-readiness-scheduling` → `C-D2GO`. */
function idOfBasename(basename: string): string {
  return parseCanonicalFilename(basename)?.id ?? basename
}

/**
 * Every name a wikilink can resolve to: the corpus files, plus folder entities
 * (`decisions/D-XXXX-slug/README.md`), which `loadCorpus` leaves out and a
 * capability's `related` routinely names.
 */
function linkTargets(planningDir: string): Set<string> {
  const names = new Set(loadCorpus(planningDir).keys())
  for (const typeDir of entityDirs(planningDir)) {
    for (const dir of entityDirs(typeDir)) names.add(dirName(dir))
  }
  return names
}

export function buildCapabilityGraph(root: string): CapabilityGraph {
  const planningDir = join(root, 'docs', 'planning')
  const warnings: string[] = []

  const targets = linkTargets(planningDir)
  const resolve = (raw: string): string | null => resolveTarget(linkTarget(raw), targets)

  interface Row {
    node: CapabilityGraphNode
    parentRaw: string | null
    relatedRaw: string[]
  }
  const rows: Row[] = []
  const idByBasename = new Map<string, string>()

  for (const row of scanEntityDir(join(planningDir, 'capabilities'))) {
    if (!row.basename.startsWith('C-')) continue
    if (row.fm === null) {
      warnings.push(`unreadable frontmatter: "${row.basename}"`)
      continue
    }
    const fm = row.fm
    const id = str(fm['id']) ?? idOfBasename(row.basename)
    const status = str(fm['status']) ?? ''
    idByBasename.set(row.basename, id)
    rows.push({
      node: {
        id,
        basename: row.basename,
        title: str(fm['title']) ?? id,
        status,
        status_group: status === '' ? 'unknown' : (status.split('/', 1)[0] as string),
        kind: str(fm['kind']),
        audience: str(fm['audience']) ?? 'system',
        parent: null,
        locations: strList(fm['locations']),
        related: [],
        tags: strList(fm['tags']),
        ghost: false,
      },
      parentRaw: str(fm['parent_key']),
      relatedRaw: strList(fm['related']),
    })
  }

  // Two files carrying one id would collapse every map keyed on it, here and
  // in the viewer. The first file keeps the id; the second is reported and
  // left off the map.
  const byId = new Map<string, Row>()
  for (const row of rows) {
    if (byId.has(row.node.id)) {
      warnings.push(`id collision: "${row.node.id}" (${row.node.basename}) already taken`)
      continue
    }
    byId.set(row.node.id, row)
  }
  const kept = [...byId.values()]
  const ghosts = new Map<string, CapabilityGraphNode>()

  // Containment: resolve each parent_key to an id, minting a ghost for a
  // target no file answers to.
  for (const row of kept) {
    if (row.parentRaw === null) continue
    const target = linkTarget(row.parentRaw)
    const resolved = resolve(target)
    const parentId = resolved === null ? null : (idByBasename.get(resolved) ?? null)
    if (parentId !== null) {
      row.node.parent = parentId
      continue
    }
    const ghostId = idOfBasename(target)
    // A stale slug on a live id (`[[C-0001-old-slug]]` after a rename) is
    // drift, not a hole: the parent exists.
    if (byId.has(ghostId)) {
      row.node.parent = ghostId
      warnings.push(`stale parent_key: "${ghostId}" referenced by "${row.node.id}" as ${target}`)
      continue
    }
    if (resolved !== null) {
      warnings.push(`parent_key is not a capability: "${ghostId}" referenced by "${row.node.id}"`)
    } else {
      warnings.push(`dangling parent_key: "${ghostId}" referenced by "${row.node.id}"`)
    }
    if (!ghosts.has(ghostId)) {
      ghosts.set(ghostId, {
        id: ghostId,
        basename: target,
        title: ghostId,
        status: '',
        status_group: 'unknown',
        kind: null,
        audience: 'system',
        parent: null,
        locations: [],
        related: [],
        tags: [],
        ghost: true,
      })
    }
    row.node.parent = ghostId
  }

  // A parent chain that closes on itself is not a tree. Cut it at its
  // smallest member so every other edge survives. `findCycles` returns the
  // cycle rotated to where the traversal closed it, so sort before choosing.
  const parentEdges = new Map<string, string[]>()
  for (const row of kept) {
    if (row.node.parent !== null) parentEdges.set(row.node.id, [row.node.parent])
  }
  for (const cycle of findCycles(byId.keys(), parentEdges)) {
    const cut = [...new Set(cycle)].sort(cmpStr)[0]
    if (cut === undefined) continue
    const row = byId.get(cut)
    if (row === undefined || row.node.parent === null) continue
    warnings.push(`parent_key cycle: ${cycle.map((id) => `"${id}"`).join(' -> ')}`)
    row.node.parent = null
  }

  // `related`: resolved basenames on the node for every type; an edge only
  // when the target is itself a capability.
  const related = buildEdges({
    nodes: byId.keys(),
    targetsOf: (id) => byId.get(id)?.relatedRaw ?? [],
    resolve,
  })
  for (const { source, raw } of related.unresolved) {
    warnings.push(`unresolved related: "${source}" -> ${linkTarget(raw)}`)
  }
  const edges: CapabilityGraphEdge[] = []
  for (const [id, targets] of related.forwardEdges) {
    const row = byId.get(id)
    if (row === undefined) continue
    row.node.related = targets
    for (const target of targets) {
      const to = idByBasename.get(target)
      if (to !== undefined && to !== id) edges.push({ from: id, to, kind: 'related' })
    }
  }

  const nodes = [...kept.map((r) => r.node), ...ghosts.values()].sort((a, b) => cmpStr(a.id, b.id))
  edges.sort((a, b) => cmpStr(a.from, b.from) || cmpStr(a.to, b.to))

  return {
    root,
    root_label: pathBasename(root),
    nodes,
    edges,
    warnings,
    scanned: kept.length,
  }
}

function renderGraph(out: CapabilityGraph, io: OpIo): number {
  for (const n of out.nodes) {
    io.stdout(
      `${n.id}\t${n.parent ?? '-'}\t${n.kind ?? '-'}\t${n.status || '-'}\t${n.ghost ? '(ghost) ' : ''}${n.title}\n`,
    )
  }
  io.stdout(
    `capabilities=${out.scanned} ghosts=${out.nodes.length - out.scanned} related-edges=${out.edges.length} warnings=${out.warnings.length}\n`,
  )
  for (const w of out.warnings) io.stdout(`warning: ${w}\n`)
  return 0
}

export default defineOp({
  path: ['capability', 'graph'],
  summary: 'The capability corpus as one graph: parent_key containment, related edges, ghosts.',
  input: z.object({}),
  output: CapabilityGraph,
  cli: { render: renderGraph },
  handler: (_args, ctx) => buildCapabilityGraph(ctx.projectRoot),
})
