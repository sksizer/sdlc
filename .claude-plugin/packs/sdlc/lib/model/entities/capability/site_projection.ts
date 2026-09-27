/**
 * The capability entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4; entity-specific code lives with
 * the entity). Registered in the docs service's `site/projections.ts`
 * OVERRIDES list.
 *
 * Identical to the generic projection (route `planning/capabilities`,
 * Id/Title/Summary roster, child pages) except the child pages surface the
 * schema-v2 axes ([[T-2KK8-capability-kind-grains-and-locations]]): the meta
 * line adds **Kind** (structural grain, when graded) and **Audience** (when
 * stored), and a `## Locations` appendix renders the code anchors when
 * present.
 */

import {
  anchoredTitleCell,
  stringList,
  type EntityView,
  type SiteProjection,
} from '@lib/util/site_table'

function metaLine(e: EntityView): string[] {
  const kind = e.fm['kind']
  const audience = e.fm['audience']
  return [
    e.status ? `**Status:** \`${e.status}\`` : '',
    typeof kind === 'string' && kind ? `**Kind:** \`${kind}\`` : '',
    typeof audience === 'string' && audience ? `**Audience:** \`${audience}\`` : '',
  ]
}

/** The `## Locations` appendix: the stored code anchors, one code-formatted
 *  bullet each. Empty string (no section) when the entity stores none. */
function locationsAppendix(e: EntityView): string {
  const locations = stringList(e.fm['locations'])
  if (locations.length === 0) return ''
  return '\n\n## Locations\n\n' + locations.map((loc) => `- \`${loc}\``).join('\n')
}

export const capabilityProjection: SiteProjection = {
  type: 'capability',
  plural: 'capabilities',
  routePrefix: 'planning/capabilities',
  rosterTitle: 'Capabilities',
  rosterDescription: 'Capabilities projected from capability entities.',
  rosterLead:
    'Capabilities, projected from capability entities. Edit a capability entity and regenerate.',
  columns: [
    { header: 'Id', cell: (e, ctx) => anchoredTitleCell(e, ctx.projection) },
    { header: 'Title', cell: (e) => e.title },
    { header: 'Summary', cell: (e) => e.summary },
  ],
  emptyPlaceholder: '',
  childPages: true,
  childBackLabel: 'Back to Capabilities',
  childMeta: metaLine,
  childBodyAppendix: locationsAppendix,
}
