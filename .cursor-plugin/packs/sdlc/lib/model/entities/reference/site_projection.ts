/**
 * The reference entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4). Registered in the docs service's
 * `site/projections.ts` OVERRIDES list.
 *
 * Reference keeps its own `/references/` route, not the generic Planning one.
 * The data here is exactly what keeps the references roster and its child pages
 * byte-identical to the committed site output.
 *
 * Two distinct related-link transforms, deliberately: the roster's Cited-by
 * cell CODE-FORMATS the related ids, while the child page's `## Cited by`
 * section runs them through wikilink RESOLUTION (sibling routes link;
 * everything else code-formats).
 */

import {
  anchoredTitleCell,
  codeFormattedRelated,
  hostLinkCell,
  stringList,
  transformWikilinks,
  type SiteProjection,
} from '@lib/util/site_table'

export const referenceProjection: SiteProjection = {
  type: 'reference',
  plural: 'references',
  routePrefix: 'references',
  rosterTitle: 'References',
  rosterDescription:
    'External documentation, research, and artifacts SDLC leans on, assembled from reference entities.',
  rosterLead:
    'External documentation, research, and artifacts SDLC leans on, catalogued once. Edit a reference entity (or run `sdlc reference create`) and regenerate.',
  columns: [
    { header: 'Reference', cell: (e, ctx) => anchoredTitleCell(e, ctx.projection) },
    { header: 'Summary', cell: (e) => e.summary },
    {
      header: 'Link',
      cell: (e) =>
        hostLinkCell(typeof e.fm['url'] === 'string' ? (e.fm['url'] as string) : undefined),
    },
    { header: 'Cited by', cell: (e) => codeFormattedRelated(stringList(e.fm['related'])) },
  ],
  emptyPlaceholder: '*None catalogued yet — `sdlc reference create` mints the first.*',
  childPages: true,
  childBackLabel: 'Back to References',
  childMeta: (e) => {
    const url = typeof e.fm['url'] === 'string' ? (e.fm['url'] as string) : undefined
    return [
      url ? `**Source:** ${hostLinkCell(url)}` : '',
      e.status ? `**Status:** \`${e.status}\`` : '',
    ]
  },
  childBodyAppendix: (e, ctx) => {
    const citedBy = transformWikilinks(stringList(e.fm['related']).join(', '), ctx.resolveRoute)
    return citedBy ? `\n\n## Cited by\n\n${citedBy}` : ''
  },
}
