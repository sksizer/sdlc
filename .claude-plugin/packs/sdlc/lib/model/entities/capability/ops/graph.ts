/**
 * `sdlc capability graph` — the capability corpus as one graph: containment
 * from `parent_key`, `related` wikilinks as edges between capabilities, and
 * (OKF v0.2 conformance, [[T-I1KJ]]) any `[[...]]` wikilink appearing in a
 * capability's BODY prose that RESOLVES TO ANOTHER CAPABILITY as a further
 * edge, tagged `kind: 'wikilink'` to distinguish it from a
 * frontmatter-declared `kind: 'related'` edge (a body link to a non-capability
 * or to nothing is reported as a warning or silently dropped, never an edge —
 * see `buildCapabilityGraph` below).
 *
 * Read fail-safe from raw frontmatter, the way `loadCorpus` reads: a malformed
 * file is a warning, never a throw, because the consumer is a viewer and an
 * empty map reads as "no capabilities" rather than "one file is broken".
 *
 * A dangling `parent_key` becomes a GHOST node rather than a silent re-root,
 * so containment holds and the hole is visible. Every warning quotes the id
 * it is about in double quotes — that is how the system-graph viewer joins a
 * warning to its node.
 *
 * The body-wikilink scan is deliberately LOCAL to this op, not a change to
 * the generic `buildEdges()` substrate (`@lib/model/corpus`) it otherwise
 * shares with `model/ops/audit.ts` and `task/ops/next.ts`: those two consume
 * `buildEdges()` for real dependency/audit semantics over frontmatter-declared
 * links only, and must not start treating a casual body-prose mention as a
 * hard graph edge. `buildEdges()` itself is reused UNMODIFIED — this file adds
 * two capability-graph-only call sites (the `related` edges and the body
 * `wikilink` edges below), on top of its other two callers (`model/ops/audit.ts`,
 * `task/ops/next.ts`) — four in total. The body-text scan walks the mdast
 * `markdown-contract` already builds (`text` nodes only, `code`/`inlineCode`
 * excluded) rather than a hand-rolled fence-stripping regex — see
 * `bodyWikilinkTargets` below.
 */

import { basename as pathBasename, join } from 'node:path'

import { parse as parseMarkdownContract } from 'markdown-contract'
import { z } from 'zod'

import { buildEdges, findCycles, loadCorpus, resolveTarget } from '@lib/model/corpus'
import { parseCanonicalFilename } from '@lib/model/identifier'
import { scanEntityDir } from '@lib/model/read'
import { OpError, defineOp, type OpIo } from '@lib/registry'
import { dirName, entityDirs } from '@lib/util/markdown_extract'
import { cmpStr } from '@lib/util/strings'
import { unwrapWikilink } from '@lib/util/wikilinks'

import { CapabilityEntity } from '../schema.ts'

export const CapabilityGraphNode = CapabilityEntity.extend({
  /** The segment before `/` in `state`: `open`, `closed`, or `unknown`. */
  state_group: z.string(),
  audience: z.string(),
  /** Resolved `product` wikilink as a basename, null when unassigned. */
  product: z.string().nullable(),
  /** Set only under `--audience`: the node failed the filter and is shown
   *  just because a kept descendant needs it to stay connected. */
  ancestor_only: z.boolean(),
  locations: z.array(z.string()),
  /** Resolved `related` targets as basenames, any entity type. */
  related: z.array(z.string()),
  tags: z.array(z.string()),
  /** Synthesized for a `parent_key` no file answers to. */
  ghost: z.boolean(),
}).meta({ id: 'CapabilityGraphNode' })

export const CapabilityGraphEdge = z
  .object({
    from: z.string(),
    to: z.string(),
    /** `related`: declared in frontmatter's `related` array. `wikilink`: a
     *  `[[...]]` occurrence in the capability's body prose (OKF v0.2
     *  conformance, [[T-I1KJ]]) — a capability can produce both kinds of edge
     *  to the same target. */
    kind: z.enum(['related', 'wikilink']),
  })
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

/** Every `[[target]]` / `[[target|alias]]` / `[[target#frag]]` occurrence in
 *  free text, capturing just `target`. The leading `(?<!!)` excludes an
 *  Obsidian `![[transclusion]]` embed — a different relationship (splicing
 *  in another document's content) than a `[[wikilink]]` mention, so it must
 *  not silently produce the same `kind: 'wikilink'` edge a mention does.
 *  Mirrors the recognition grammar `roadmap/sections.ts#WIKILINK_SCAN_RE`
 *  and `util/site_table.ts`'s `transformWikilinks` use for the same shape —
 *  deliberately duplicated rather than shared (see the module header note on
 *  why this scan stays local to the capability graph). Applied only to mdast
 *  `text` node values (`bodyWikilinkTargets` below), so — unlike a plain
 *  string scan over raw markdown — it never needs to itself account for code
 *  fences or inline code spans. */
const BODY_WIKILINK_RE = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g

/**
 * Visit every mdast `text` node's string value in document order, skipping
 * `code` and `inlineCode` subtrees. Both are leaf nodes that hold their raw
 * content directly in `.value`, never as a nested `text` child, so the skip
 * is belt-and-suspenders (documents the intent, survives a future
 * mdast-util shape change) rather than load-bearing today.
 */
function walkTextNodes(node: unknown, visit: (value: string) => void): void {
  if (node === null || typeof node !== 'object') return
  const n = node as { type?: unknown; value?: unknown; children?: unknown }
  if (n.type === 'code' || n.type === 'inlineCode') return
  if (n.type === 'text' && typeof n.value === 'string') {
    visit(n.value)
    return
  }
  if (Array.isArray(n.children)) {
    for (const child of n.children) walkTextNodes(child, visit)
  }
}

/**
 * Every wikilink TARGET (already unwrapped, trimmed) named in `rawText`'s
 * BODY prose — found by walking the mdast tree `markdown-contract` already
 * builds ([#2412](https://github.com/sksizer/dev/pull/2412) review round 1,
 * replacing a hand-rolled fence-stripping regex that missed several real
 * CommonMark shapes: a fence indented inside a list item, an unclosed fence,
 * a closing fence longer than its opener, and an inline code span). The
 * frontmatter block needs no separate stripping either: `markdown-contract`
 * parses it into its own `yaml` node, which this walk never visits (only
 * `text` nodes are), so a `related:` entry is never double-counted as a body
 * wikilink. `parse()` is a total function over any string input (remark has
 * no "invalid markdown" — worst case, unparseable syntax degrades to a plain
 * paragraph of text), so there is no failure mode here to fail safe from.
 */
function bodyWikilinkTargets(rawText: string): string[] {
  const tree = parseMarkdownContract(rawText).mdast
  const targets: string[] = []
  walkTextNodes(tree, (value) => {
    for (const m of value.matchAll(BODY_WIKILINK_RE)) {
      const target = m[1]?.trim()
      if (target !== undefined && target.length > 0) targets.push(target)
    }
  })
  return targets
}

/** `[[PR-0001-slug]]` → `PR-0001-slug`; null when absent. */
function productBasename(value: unknown): string | null {
  const raw = str(value)
  return raw === null ? null : linkTarget(raw)
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

/** One capability file's raw, not-yet-resolved graph inputs, plus the node it builds. */
interface CapabilityRow {
  node: CapabilityGraphNode
  parentRaw: string | null
  relatedRaw: string[]
  /** Raw (already-unwrapped) wikilink targets found in the body prose,
   *  encounter order, duplicates included — `buildEdges` de-dupes after
   *  resolution. OKF v0.2 conformance, [[T-I1KJ]]. */
  bodyWikilinksRaw: string[]
}

/** Scan every `C-*` capability file into a {@link CapabilityRow}, warning on unreadable frontmatter. */
function scanCapabilityRows(
  planningDir: string,
  warnings: string[],
): { rows: CapabilityRow[]; idByBasename: Map<string, string> } {
  const rows: CapabilityRow[] = []
  const idByBasename = new Map<string, string>()

  for (const row of scanEntityDir(join(planningDir, 'capabilities'), { withText: true })) {
    if (!row.basename.startsWith('C-')) continue
    if (row.fm === null) {
      warnings.push(`unreadable frontmatter: "${row.basename}"`)
      continue
    }
    const fm = row.fm
    const id = str(fm['id']) ?? idOfBasename(row.basename)
    const state = str(fm['state']) ?? ''
    idByBasename.set(row.basename, id)
    rows.push({
      node: {
        id,
        basename: row.basename,
        title: str(fm['title']) ?? id,
        state,
        state_group: state === '' ? 'unknown' : (state.split('/', 1)[0] as string),
        kind: str(fm['kind']),
        audience: str(fm['audience']) ?? 'system',
        product: productBasename(fm['product']),
        ancestor_only: false,
        parent: null,
        locations: strList(fm['locations']),
        related: [],
        tags: strList(fm['tags']),
        ghost: false,
      },
      parentRaw: str(fm['parent_key']),
      relatedRaw: strList(fm['related']),
      bodyWikilinksRaw: row.text !== undefined ? bodyWikilinkTargets(row.text) : [],
    })
  }

  return { rows, idByBasename }
}

/**
 * Two files carrying one id would collapse every map keyed on it, here and in
 * the viewer. The first file keeps the id; the second is reported and left
 * off the map.
 */
function dedupeById(rows: CapabilityRow[], warnings: string[]): Map<string, CapabilityRow> {
  const byId = new Map<string, CapabilityRow>()
  for (const row of rows) {
    if (byId.has(row.node.id)) {
      warnings.push(`id collision: "${row.node.id}" (${row.node.basename}) already taken`)
      continue
    }
    byId.set(row.node.id, row)
  }
  return byId
}

/**
 * Containment: resolve each `parent_key` to an id, minting a ghost for a
 * target no file answers to. Mutates `row.node.parent` on every row in
 * `kept`; returns the ghost nodes minted along the way.
 */
function resolveContainment(
  kept: CapabilityRow[],
  byId: Map<string, CapabilityRow>,
  idByBasename: Map<string, string>,
  resolve: (raw: string) => string | null,
  warnings: string[],
): Map<string, CapabilityGraphNode> {
  const ghosts = new Map<string, CapabilityGraphNode>()

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
        state: '',
        state_group: 'unknown',
        kind: null,
        audience: 'system',
        product: null,
        ancestor_only: false,
        parent: null,
        locations: [],
        related: [],
        tags: [],
        ghost: true,
      })
    }
    row.node.parent = ghostId
  }

  return ghosts
}

/**
 * A parent chain that closes on itself is not a tree. Cut it at its smallest
 * member so every other edge survives. `findCycles` returns the cycle
 * rotated to where the traversal closed it, so sort before choosing. Mutates
 * the cut row's `node.parent` in place.
 */
function cutParentCycles(
  kept: CapabilityRow[],
  byId: Map<string, CapabilityRow>,
  warnings: string[],
): void {
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
}

/**
 * `related`: resolved basenames on the node for every type; an edge only
 * when the target is itself a capability. Mutates `row.node.related` on
 * every row `related.forwardEdges` names. Also returns `relatedPairs` — the
 * `(from, to)` pairs already carrying a `related` edge — so {@link
 * buildWikilinkEdges} can skip a body wikilink to the same pair rather than
 * add it as a second edge.
 */
function buildRelatedEdges(
  byId: Map<string, CapabilityRow>,
  idByBasename: Map<string, string>,
  resolve: (raw: string) => string | null,
  warnings: string[],
): { edges: CapabilityGraphEdge[]; relatedPairs: Set<string> } {
  const related = buildEdges({
    nodes: byId.keys(),
    targetsOf: (id) => byId.get(id)?.relatedRaw ?? [],
    resolve,
  })
  for (const { source, raw } of related.unresolved) {
    warnings.push(`unresolved related: "${source}" -> ${linkTarget(raw)}`)
  }
  const edges: CapabilityGraphEdge[] = []
  // (from, to) pairs already carrying a `related` edge — a body wikilink to
  // the same pair is skipped below rather than added as a second edge
  // ([#2412](https://github.com/sksizer/dev/pull/2412) review round 1: the
  // system-graph viewer's `aggregateEdges` groups edges by pair and can't
  // display two edges between the same two nodes, so an un-deduplicated
  // `related` + `wikilink` pair rendered as a misleading "2 deps"/count-2
  // edge). `related` is the more intentional, explicit declaration, so it
  // wins the pair; the looser body-prose mention is redundant once a
  // `related` edge already says the same thing.
  const relatedPairs = new Set<string>()
  for (const [id, targets] of related.forwardEdges) {
    const row = byId.get(id)
    if (row === undefined) continue
    row.node.related = targets
    for (const target of targets) {
      const to = idByBasename.get(target)
      if (to !== undefined && to !== id) {
        edges.push({ from: id, to, kind: 'related' })
        relatedPairs.add(`${id}\u0000${to}`)
      }
    }
  }
  return { edges, relatedPairs }
}

/**
 * Body wikilinks (OKF v0.2 conformance, [[T-I1KJ]]): a `[[...]]` occurrence
 * in the body prose is ALSO an edge, tagged `kind: 'wikilink'` — but only
 * when no `related`-array edge already connects the same pair (`relatedPairs`,
 * from {@link buildRelatedEdges} — [#2412](https://github.com/sksizer/dev/pull/2412)
 * review round 1: the system-graph viewer's `aggregateEdges` groups edges by
 * pair and can't display two edges between the same two nodes, so an
 * un-deduplicated `related` + `wikilink` pair rendered as a misleading "2
 * deps"/count-2 edge). Resolved and reported exactly like `related` above:
 * an unresolved link is a warning (deduplicated — the same body link to a
 * non-entity narrative page, e.g. a mention repeated across a capability's
 * prose, would otherwise repeat the identical warning line once per
 * occurrence), a resolved-but-non-capability target is silently dropped
 * (same "edge only between capabilities" policy `related` follows).
 * `buildEdges` is the same generic substrate `related` uses, called again
 * unmodified with body-text targets — see the module header note on why
 * this stays a capability-graph-local call rather than a change to
 * `buildEdges()`'s other callers.
 */
function buildWikilinkEdges(
  byId: Map<string, CapabilityRow>,
  idByBasename: Map<string, string>,
  resolve: (raw: string) => string | null,
  warnings: string[],
  relatedPairs: Set<string>,
): CapabilityGraphEdge[] {
  const wikilinks = buildEdges({
    nodes: byId.keys(),
    targetsOf: (id) => byId.get(id)?.bodyWikilinksRaw ?? [],
    resolve,
  })
  const warnedUnresolvedWikilinks = new Set<string>()
  for (const { source, raw } of wikilinks.unresolved) {
    const key = `${source}\u0000${linkTarget(raw)}`
    if (warnedUnresolvedWikilinks.has(key)) continue
    warnedUnresolvedWikilinks.add(key)
    warnings.push(`unresolved wikilink: "${source}" -> ${linkTarget(raw)}`)
  }
  const edges: CapabilityGraphEdge[] = []
  for (const [id, targets] of wikilinks.forwardEdges) {
    for (const target of targets) {
      const to = idByBasename.get(target)
      if (to !== undefined && to !== id && !relatedPairs.has(`${id}\u0000${to}`)) {
        edges.push({ from: id, to, kind: 'wikilink' })
      }
    }
  }
  return edges
}

export function buildCapabilityGraph(root: string): CapabilityGraph {
  const planningDir = join(root, 'docs', 'planning')
  const warnings: string[] = []

  const targets = linkTargets(planningDir)
  const resolve = (raw: string): string | null => resolveTarget(linkTarget(raw), targets)

  const { rows, idByBasename } = scanCapabilityRows(planningDir, warnings)
  const byId = dedupeById(rows, warnings)
  const kept = [...byId.values()]

  const ghosts = resolveContainment(kept, byId, idByBasename, resolve, warnings)
  cutParentCycles(kept, byId, warnings)

  const relatedResult = buildRelatedEdges(byId, idByBasename, resolve, warnings)
  const edges: CapabilityGraphEdge[] = [
    ...relatedResult.edges,
    ...buildWikilinkEdges(byId, idByBasename, resolve, warnings, relatedResult.relatedPairs),
  ]

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

/**
 * Keep only nodes of `audience` plus every ancestor of a kept node (so the
 * tree stays connected), marking the ancestors `ancestor_only`. Edges are
 * restricted to surviving nodes. Planning use: `audience: user` is the
 * features lens.
 */
export function filterByAudience(graph: CapabilityGraph, audience: string): CapabilityGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const keep = new Set<string>()
  const matched = new Set(
    graph.nodes.filter((n) => !n.ghost && n.audience === audience).map((n) => n.id),
  )
  for (const id of matched) {
    // Parent chains are acyclic (`cutParentCycles`), so this terminates.
    for (
      let cur: string | null = id;
      cur !== null && !keep.has(cur);
      cur = byId.get(cur)?.parent ?? null
    ) {
      keep.add(cur)
    }
  }
  const nodes = graph.nodes
    .filter((n) => keep.has(n.id))
    .map((n) => (matched.has(n.id) ? n : { ...n, ancestor_only: true }))
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to))
  return { ...graph, nodes, edges }
}

/** The `[kind, audience]` suffix of a tree or unnested line; none for a ghost, which has neither. */
function bracket(n: CapabilityGraphNode): string {
  if (n.ghost) return ''
  return ` [${n.kind === null ? n.audience : `${n.kind}, ${n.audience}`}]`
}

/** One capability as a tree or unnested line: id, title, brackets, then the `·` ancestor marker. */
function describeNode(n: CapabilityGraphNode): string {
  return `${n.id} ${n.ghost ? '(ghost) ' : ''}${n.title}${bracket(n)}${n.ancestor_only ? ' ·' : ''}`
}

/**
 * The containment tree, one capability per line, two spaces per level,
 * children in id order (`graph.nodes` is already id-sorted). Roots are the
 * nodes with no parent in the graph, ghosts included — a ghost is the parent
 * of real nodes. `depth` caps the levels shown, roots being level 1; a node
 * with hidden children carries `(+K)`, K the hidden descendants. Parent chains
 * are acyclic after `cutParentCycles`, so the walk terminates.
 */
export function renderTree(graph: CapabilityGraph, depth?: number): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id))
  const children = new Map<string | null, CapabilityGraphNode[]>()
  for (const n of graph.nodes) {
    const key = n.parent !== null && ids.has(n.parent) ? n.parent : null
    const siblings = children.get(key)
    if (siblings === undefined) children.set(key, [n])
    else siblings.push(n)
  }
  const descendants = (id: string): number =>
    (children.get(id) ?? []).reduce((sum, c) => sum + 1 + descendants(c.id), 0)

  const lines: string[] = []
  const walk = (n: CapabilityGraphNode, level: number): void => {
    const kids = children.get(n.id) ?? []
    const hidden = depth !== undefined && level >= depth && kids.length > 0
    lines.push(
      `${'  '.repeat(level - 1)}${describeNode(n)}${hidden ? ` (+${descendants(n.id)})` : ''}`,
    )
    if (hidden) return
    for (const c of kids) walk(c, level + 1)
  }
  for (const root of children.get(null) ?? []) walk(root, 1)
  return lines
}

/**
 * Capabilities outside the containment tree: real (non-ghost) nodes with no
 * parent whose kind is not `system`. Unnested capabilities are allowed, so
 * this is information for the reader, never a warning.
 */
export function unnestedOf(graph: CapabilityGraph): CapabilityGraphNode[] {
  return graph.nodes.filter((n) => !n.ghost && n.parent === null && n.kind !== 'system')
}

type GraphRenderInput = Pick<z.infer<typeof GraphInput>, 'tree' | 'depth' | 'unnested'>

/**
 * Text render. Default is the tab-separated table (the stable surface other
 * tools read); `tree` swaps it for the containment tree, `unnested` adds the
 * informational list of capabilities outside the tree (alone, it replaces the
 * table). An audience filter shows fewer capabilities than were scanned,
 * which the output cannot otherwise tell apart from an unfiltered run, so the
 * footer reads `shown=N of capabilities=M` whenever the non-ghost node count
 * falls short of `scanned`. `--unnested` never touches the footer's
 * `warnings=` count or the exit code.
 */
export function renderGraph(
  out: CapabilityGraph,
  io: OpIo,
  flags: GraphRenderInput = { tree: false, unnested: false },
): number {
  if (flags.tree) {
    for (const line of renderTree(out, flags.depth)) io.stdout(`${line}\n`)
  } else if (!flags.unnested) {
    for (const n of out.nodes) {
      io.stdout(
        `${n.id}\t${n.parent ?? '-'}\t${n.kind ?? '-'}\t${n.audience}\t${n.state || '-'}\t${n.ghost ? '(ghost) ' : ''}${n.title}${n.ancestor_only ? ' ·' : ''}\n`,
      )
    }
  }
  if (flags.unnested) {
    const unnested = unnestedOf(out)
    io.stdout(
      `unnested capabilities (information, not a warning; nesting is optional): ${unnested.length}\n`,
    )
    for (const n of unnested) io.stdout(`  ${describeNode(n)}\n`)
  }
  const relatedCount = out.edges.filter((e) => e.kind === 'related').length
  const wikilinkCount = out.edges.filter((e) => e.kind === 'wikilink').length
  const shown = out.nodes.filter((n) => !n.ghost).length
  const count =
    shown === out.scanned
      ? `capabilities=${out.scanned}`
      : `shown=${shown} of capabilities=${out.scanned}`
  io.stdout(
    `${count} ghosts=${out.nodes.filter((n) => n.ghost).length} related-edges=${relatedCount} wikilink-edges=${wikilinkCount} warnings=${out.warnings.length}\n`,
  )
  for (const w of out.warnings) io.stdout(`warning: ${w}\n`)
  return 0
}

const GraphInput = z.object({
  audience: z
    .enum(['user', 'system'])
    .optional()
    .describe(
      'Show only this audience (`user` = the features lens), keeping ancestors so the tree stays connected; ancestors that fail the filter are marked `·`. Applies to every output mode.',
    ),
  tree: z
    .boolean()
    .default(false)
    .describe(
      'Print the containment tree instead of the table: one capability per line, indented two spaces per level, children in id order. Text output only: ignored under `--output json`.',
    ),
  depth: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'With --tree, show only the first N levels (roots are level 1); a node with hidden children shows `(+K)` for its K hidden descendants. Text output only; refused without --tree, even under `--output json`.',
    ),
  unnested: z
    .boolean()
    .default(false)
    .describe(
      'List capabilities with no parent_key and a kind other than `system`, as information (never a warning or an exit-code change). Text output only: ignored under `--output json`. Alone it replaces the table.',
    ),
})

export default defineOp({
  path: ['capability', 'graph'],
  summary: 'The capability corpus as one graph: parent_key containment, related edges, ghosts.',
  // Read-only: reads the capability corpus and reports its graph; writes
  // nothing.
  mutating: false,
  input: GraphInput,
  output: CapabilityGraph,
  cli: { render: renderGraph },
  handler: (args, ctx) => {
    if (args.depth !== undefined && !args.tree) {
      throw new OpError('INVALID_INPUT', '--depth requires --tree')
    }
    const graph = buildCapabilityGraph(ctx.projectRoot)
    return args.audience === undefined ? graph : filterByAudience(graph, args.audience)
  },
})
