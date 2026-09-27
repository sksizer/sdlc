/**
 * The term entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4). Entity-specific code lives with
 * the entity (the report-kind precedent); registered in the docs service's
 * `site/projections.ts` OVERRIDES list.
 *
 * Term keeps its `/glossary/` route (link stability — it stays in the Appendix,
 * not Planning) and its Term / Definition / Source columns. This module carries
 * exactly the data that makes the existing site glossary page (roster + child
 * pages) byte-identical to the pre-framework output.
 */

import {
  anchoredTitleCell,
  codeFormattedRelated,
  stringList,
  type EntityView,
  type SiteProjection,
} from '@lib/util/site_table'

/** A term's Term cell: the anchored linked title, aliases parenthetical. */
function termCell(e: EntityView, projection: SiteProjection): string {
  const linked = anchoredTitleCell(e, projection)
  const aliases = stringList(e.fm['aliases'])
  return aliases.length > 0 ? `${linked} (${aliases.join(', ')})` : linked
}

export const termProjection: SiteProjection = {
  type: 'term',
  plural: 'terms',
  routePrefix: 'glossary',
  rosterTitle: 'Glossary',
  rosterDescription: 'SDLC architecture vocabulary, assembled from term entities.',
  rosterLead:
    'SDLC architecture vocabulary, defined once. Edit a term entity (or run `sdlc term create`) and regenerate.',
  columns: [
    { header: 'Term', cell: (e, ctx) => termCell(e, ctx.projection) },
    { header: 'Definition', cell: (e) => e.summary },
    { header: 'Source', cell: (e) => codeFormattedRelated(stringList(e.fm['related'])) },
  ],
  emptyPlaceholder: '',
  childPages: true,
  childBackLabel: 'Back to the Glossary',
  childMeta: (e) => [
    e.status ? `**Status:** \`${e.status}\`` : '',
    stringList(e.fm['aliases']).length > 0
      ? `**Aliases:** ${stringList(e.fm['aliases']).join(', ')}`
      : '',
  ],
  childBodyAppendix: () => '',
}
