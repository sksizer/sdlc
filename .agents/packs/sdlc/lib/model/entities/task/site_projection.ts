/**
 * The task entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4). Registered in the docs service's
 * `site/projections.ts` OVERRIDES list.
 *
 * Tasks are the highest-volume, most-referenced corpus, so they live under
 * Planning (route `planning/tasks`, the generic default — NOT a custom Appendix
 * route). The override ADDS three domain columns to the generic Id / Title /
 * Summary roster — **Status**, **Impact**, **Complexity** — the triage axes a
 * reader scans a task list by. The follow-up table already carries its own
 * Status column (non-active rows), so the Status column here surfaces the exact
 * lifecycle stage (`open/ready`, `in-progress`, …) in the Active table too.
 *
 * On CHILD pages the override resolves `depends_on` — a list of `[[T-NNNN]]`
 * wikilinks to hard, one-direction dependencies — into a `## Depends on`
 * section. Each entry runs through the framework's wikilink RESOLVER
 * (`transformWikilinks` + `ctx.resolveRoute`): a dependency with a sibling task
 * child page links to that route; a dependency without one code-formats — the
 * same resolve-or-code-format seam as reference's `## Cited by` appendix.
 */

import {
  anchoredTitleCell,
  stringList,
  transformWikilinks,
  type EntityView,
  type SiteProjection,
} from '@lib/util/site_table'

/** A task's `impact` frontmatter (triage value: high/medium/low), or `""` when
 *  unset. */
export function taskImpact(e: EntityView): string {
  const v = e.fm['impact']
  return typeof v === 'string' && v.length > 0 ? v : ''
}

/** A task's `complexity` frontmatter (rough effort: small/medium/large), or
 *  `""` when unset. */
export function taskComplexity(e: EntityView): string {
  const v = e.fm['complexity']
  return typeof v === 'string' && v.length > 0 ? v : ''
}

export const taskProjection: SiteProjection = {
  type: 'task',
  plural: 'tasks',
  routePrefix: 'planning/tasks',
  rosterTitle: 'Tasks',
  rosterDescription: 'Units of work, projected from task entities.',
  rosterLead:
    'Units of work — each a status, impact, and complexity. Edit a task entity (or run `sdlc task create`) and regenerate.',
  columns: [
    { header: 'Id', cell: (e, ctx) => anchoredTitleCell(e, ctx.projection) },
    { header: 'Title', cell: (e) => e.title },
    { header: 'Summary', cell: (e) => e.summary },
    { header: 'Status', cell: (e) => (e.status ? `\`${e.status}\`` : '') },
    { header: 'Impact', cell: (e) => (taskImpact(e) ? `\`${taskImpact(e)}\`` : '') },
    { header: 'Complexity', cell: (e) => (taskComplexity(e) ? `\`${taskComplexity(e)}\`` : '') },
  ],
  emptyPlaceholder: '',
  childPages: true,
  childBackLabel: 'Back to Tasks',
  childMeta: (e) => [
    e.status ? `**Status:** \`${e.status}\`` : '',
    taskImpact(e) ? `**Impact:** \`${taskImpact(e)}\`` : '',
    taskComplexity(e) ? `**Complexity:** \`${taskComplexity(e)}\`` : '',
  ],
  childBodyAppendix: (e, ctx) => {
    const dependsOn = transformWikilinks(
      stringList(e.fm['depends_on']).join(', '),
      ctx.resolveRoute,
    )
    return dependsOn ? `\n\n## Depends on\n\n${dependsOn}` : ''
  },
}
