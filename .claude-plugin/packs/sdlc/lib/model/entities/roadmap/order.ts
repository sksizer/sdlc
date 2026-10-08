/**
 * Ordered-flow rules for `./ops/check.ts`, enabled by `roadmap check
 * --strict-order`. They answer "is the flow from roadmap to milestone to task
 * ordered?", which the cross-reference rules in `check.ts` (do the links
 * resolve?) do not:
 *
 *   - `unroadmapped_milestone`   — an `open/*` milestone no roadmap links and
 *     that does not carry the `deferred` tag.
 *   - `version_section_mismatch` — a milestone listed under a `## vX.Y.Z`
 *     section whose own `version:` is absent or names a different release.
 *   - `task_without_milestone`   — an `open/*` task no open milestone claims.
 *
 * "Claims" means: the task is in an open milestone's `tasks:` list, or names
 * an open milestone in its own `related:`, or its `parent_key` task is
 * claimed that way (a milestone rosters the parent task, not each child; one
 * level only, a grandchild is not covered).
 * The task schema has no dedicated `milestone` field; `related:` is its only
 * loose link to one.
 *
 * The first and third rules are corpus-wide, so they run once per
 * invocation over every roadmap; the second is per roadmap.
 */

import { join, relative } from 'node:path'

import { cmpStr } from '@lib/util/strings'
import { stringList } from '@lib/util/site_table'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { resolveTarget } from '@lib/model/corpus'
import type { CorpusEntry } from '@lib/model/corpus'
import { readRawFrontmatter } from '@lib/model/read'

import type { MilestoneLinkOccurrence } from './sections'

/** The tag marking a milestone as parked on purpose, exempt from
 *  `unroadmapped_milestone`. */
export const DEFERRED_TAG = 'deferred'

/** A `## vX.Y.Z` section heading's version, `v` stripped; `null` for any
 *  other heading (`## Pre-release`, `## Overview`, …). A trailing title
 *  after the version (`## v0.9.0 Nested projects`) is allowed. */
export function sectionVersion(sectionName: string): string | null {
  const first = (sectionName.trim().split(/\s+/)[0] ?? '').replace(/[:,;]$/, '')
  const m = /^v(\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?)$/.exec(first)
  return m === null ? null : (m[1] as string)
}

/** One ordered-flow finding; `check.ts` stamps it with the roadmap id (or the
 *  entity basename for corpus-wide rules) and its `kind` enum. */
export interface OrderFinding {
  id: string
  kind: 'unroadmapped_milestone' | 'version_section_mismatch' | 'task_without_milestone'
  message: string
  location: string
}

function isOpen(entry: CorpusEntry | undefined): boolean {
  return entry !== undefined && entry.state.startsWith('open/')
}

function resolveLink(raw: string, names: Set<string>): string | null {
  return resolveTarget(unwrapWikilink(raw) ?? raw, names)
}

/** `version_section_mismatch` over one roadmap's occurrences. */
export function checkVersionSections(
  occurrences: MilestoneLinkOccurrence[],
  planningRoot: string,
  roadmapId: string,
  relPath: string,
): OrderFinding[] {
  const findings: OrderFinding[] = []
  for (const occ of occurrences) {
    const heading = sectionVersion(occ.sectionName)
    if (heading === null || occ.resolved === null) continue
    const fm = readRawFrontmatter(join(planningRoot, 'milestones', `${occ.resolved}.md`))
    const raw = fm?.['version']
    const version =
      typeof raw === 'string' || typeof raw === 'number' ? String(raw).replace(/^v/, '') : null
    if (version === heading) continue
    findings.push({
      id: roadmapId,
      kind: 'version_section_mismatch',
      message:
        version === null
          ? `milestone ${occ.resolved} is listed under "${occ.sectionName}" but has no version:. Remedy: set version: ${heading} on the milestone, or move it out of the section.`
          : `milestone ${occ.resolved} is listed under "${occ.sectionName}" but its version: is ${version}. Remedy: make the milestone's version: and the section heading agree.`,
      location: `${relPath}:${occ.line}`,
    })
  }
  return findings
}

/** The corpus-wide rules: `unroadmapped_milestone` and
 *  `task_without_milestone`. `linkedMilestones` is every milestone basename
 *  any roadmap resolves to. */
export function checkCorpusOrder(
  linkedMilestones: ReadonlySet<string>,
  corpus: ReadonlyMap<string, CorpusEntry>,
  planningRoot: string,
  projectRoot: string,
): OrderFinding[] {
  const findings: OrderFinding[] = []
  const names = new Set(corpus.keys())
  const openMilestones: string[] = []
  for (const [name, entry] of corpus) {
    if (entry.type === 'milestone' && isOpen(entry)) openMilestones.push(name)
  }
  openMilestones.sort(cmpStr)

  const claimed = new Set<string>()
  for (const name of openMilestones) {
    const path = join(planningRoot, 'milestones', `${name}.md`)
    const fm = readRawFrontmatter(path)
    if (!linkedMilestones.has(name) && !stringList(fm?.['tags']).includes(DEFERRED_TAG)) {
      findings.push({
        id: name,
        kind: 'unroadmapped_milestone',
        message: `open milestone ${name} is on no roadmap and is not tagged ${DEFERRED_TAG}. Remedy: list it under a roadmap version section, or add tags: [${DEFERRED_TAG}].`,
        location: relative(projectRoot, path),
      })
    }
    for (const raw of stringList(fm?.['tasks'])) {
      const target = resolveLink(raw, names)
      if (target !== null) claimed.add(target)
    }
  }

  const openMilestoneSet = new Set(openMilestones)
  const claimedByRelated = (fm: Record<string, unknown> | null): boolean =>
    stringList(fm?.['related']).some((raw) => {
      const target = resolveLink(raw, names)
      return target !== null && openMilestoneSet.has(target)
    })

  const tasks = [...corpus]
    .filter(([, entry]) => entry.type === 'task' && isOpen(entry))
    .map(([name]) => name)
    .sort(cmpStr)
  for (const name of tasks) {
    const path = join(planningRoot, 'tasks', `${name}.md`)
    const fm = readRawFrontmatter(path)
    if (claimed.has(name) || claimedByRelated(fm)) continue
    const parentRaw = fm?.['parent_key']
    const parent = typeof parentRaw === 'string' ? resolveLink(parentRaw, names) : null
    if (parent !== null) {
      const parentFm = readRawFrontmatter(join(planningRoot, 'tasks', `${parent}.md`))
      if (claimed.has(parent) || claimedByRelated(parentFm)) continue
    }
    findings.push({
      id: name,
      kind: 'task_without_milestone',
      message: `open task ${name} is claimed by no open milestone. Remedy: add it to an open milestone's tasks:, or close it.`,
      location: relative(projectRoot, path),
    })
  }
  return findings
}
