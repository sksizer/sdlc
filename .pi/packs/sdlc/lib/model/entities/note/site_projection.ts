/**
 * The note entity's site projection override
 * ([[D-0010-deterministic-site-assembly]] §4). Registered in the docs service's
 * `site/projections.ts` OVERRIDES list. Generic route (`planning/notes`) with a
 * roster of title, genre, state and parent.
 */

import { anchoredTitleCell, type EntityView, type SiteProjection } from '@lib/util/site_table'

function str(e: EntityView, key: string): string {
  const v = e.fm[key]
  return typeof v === 'string' ? v : ''
}

export const noteProjection: SiteProjection = {
  type: 'note',
  plural: 'notes',
  routePrefix: 'planning/notes',
  rosterTitle: 'Notes',
  rosterDescription:
    'Freeform plans, research, analyses, and strategy documents, projected from note entities.',
  rosterLead:
    'Freeform documents that sit in the ontology, projected from note entities. Edit a note (or run `sdlc note create`) and regenerate.',
  columns: [
    { header: 'Note', cell: (e, ctx) => anchoredTitleCell(e, ctx.projection) },
    { header: 'Genre', cell: (e) => (str(e, 'genre') ? `\`${str(e, 'genre')}\`` : '') },
    { header: 'State', cell: (e) => (e.state ? `\`${e.state}\`` : '') },
    { header: 'Parent', cell: (e) => (str(e, 'parent') ? `\`${str(e, 'parent')}\`` : '') },
  ],
  emptyPlaceholder: '*None yet — `sdlc note create` mints the first.*',
  childPages: true,
  childBackLabel: 'Back to Notes',
  childMeta: (e) => [
    e.state ? `**State:** \`${e.state}\`` : '',
    str(e, 'genre') ? `**Genre:** \`${str(e, 'genre')}\`` : '',
  ],
  childBodyAppendix: () => '',
}
