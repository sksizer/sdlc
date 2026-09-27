/**
 * The milestone entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4). Registered in the docs service's
 * `site/projections.ts` OVERRIDES list.
 *
 * Milestones live under Planning (route `planning/milestones`, the generic
 * default — NOT a custom Appendix route like term/reference). The override
 * exists only to ADD two domain columns to the generic Id / Title / Summary
 * roster: **Version** (the semver this milestone targets/ships as — roadmap
 * order) and **Target date** (the aspirational landing date). Both render a
 * blank cell when unset (a milestone may be deferred/unpositioned). Everything
 * else — child pages, bucketing, wikilink resolution, the default
 * `**Status:**` child meta — is the generic behaviour.
 *
 * The two cell accessors (`milestoneVersion`, `milestoneTargetDate`) are
 * exported so the generated roadmap ([[T-9LHH-site-roadmap-generated]]) reads
 * the SAME version/target-date derivation the roster shows — one source, no
 * drift between the milestones roster and the roadmap.
 */

import { anchoredTitleCell, type EntityView, type SiteProjection } from '@lib/util/site_table'

/** A milestone's `version` frontmatter (the targeted/shipped semver), or `""`
 *  when unset (deferred/unpositioned). Code-formatted for the roster cell. */
export function milestoneVersion(e: EntityView): string {
  const v = e.fm['version']
  return typeof v === 'string' && v.length > 0 ? v : ''
}

/** A milestone's `target_date` frontmatter (aspirational landing date), or `""`
 *  when unset. */
export function milestoneTargetDate(e: EntityView): string {
  const d = e.fm['target_date']
  return typeof d === 'string' && d.length > 0 ? d : ''
}

export const milestoneProjection: SiteProjection = {
  type: 'milestone',
  plural: 'milestones',
  routePrefix: 'planning/milestones',
  rosterTitle: 'Milestones',
  rosterDescription: 'Release-shaped groupings of work, projected from milestone entities.',
  rosterLead:
    'Release-shaped groupings of work — each a target date and success criteria. Edit a milestone entity (or run `sdlc milestone create`) and regenerate.',
  columns: [
    { header: 'Id', cell: (e, ctx) => anchoredTitleCell(e, ctx.projection) },
    { header: 'Title', cell: (e) => e.title },
    { header: 'Summary', cell: (e) => e.summary },
    { header: 'Version', cell: (e) => (milestoneVersion(e) ? `\`${milestoneVersion(e)}\`` : '') },
    { header: 'Target date', cell: (e) => milestoneTargetDate(e) },
  ],
  emptyPlaceholder: '',
  childPages: true,
  childBackLabel: 'Back to Milestones',
  childMeta: (e) => [
    e.status ? `**Status:** \`${e.status}\`` : '',
    milestoneVersion(e) ? `**Version:** \`${milestoneVersion(e)}\`` : '',
    milestoneTargetDate(e) ? `**Target date:** ${milestoneTargetDate(e)}` : '',
  ],
  childBodyAppendix: () => '',
}
