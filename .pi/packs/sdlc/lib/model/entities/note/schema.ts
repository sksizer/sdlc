/**
 * Note entity — Zod schema.
 *
 * A Note is a freeform document that sits in the ontology graph: strict
 * frontmatter (identity, `genre`, lifecycle, links), free-form body. Plans,
 * research write-ups, analyses, strategy docs, retros. `CommonFrontmatter`
 * base + Note-specific fields, `.strict()`, plus the shared supersession rule
 * (`closed/superseded ⇒ superseded_by`).
 */

import { contract, lenientBody } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DOC_WIKILINK_PATTERN,
  entityIdPattern,
  entityWikilinkPattern,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

export const SCHEMA_VERSION = '1'

/** Note-shaped wikilink (slug optional). */
export const NOTE_WIKILINK_PATTERN = entityWikilinkPattern('N')

/** The document genres a Note may declare. */
export const NOTE_GENRES = [
  'plan',
  'research',
  'analysis',
  'strategy',
  'proposal',
  'survey',
  'retro',
  'checklist',
] as const

export const NoteSchema = CommonFrontmatter.extend({
  type: z.literal('note').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('N'))
    .describe(
      "Immutable identifier per [[D-0002-entity-identifier-shape]]: 'N-' + 4 " +
        'base-36 chars [0-9A-Z]. Matches the filename; never renamed once assigned.',
    ),
  state: z
    .enum(['open/draft', 'open/active', 'closed/superseded', 'closed/archived'])
    .default('open/draft')
    .describe(
      'Lifecycle stage. open/draft: being written (the default); open/active: ' +
        'current and leaned on; closed/superseded: replaced by the note in ' +
        '`superseded_by`; closed/archived: no longer current, kept for link stability.',
    ),
  genre: z
    .enum(NOTE_GENRES)
    .describe(
      'What kind of document this is. plan: sequenced intent to build something; ' +
        'research: findings gathered from sources; analysis: reasoning over data or ' +
        'code to reach a conclusion; strategy: direction and trade-offs at the ' +
        'product level; proposal: a change put forward for a decision; survey: a ' +
        'broad inventory of an area; retro: a look back at what happened; ' +
        'checklist: steps to tick through.',
    ),
  parent: z
    .string()
    .regex(NOTE_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the hub Note this one is a sub-document of. Slug is optional ' +
        'per [[D-0002-entity-identifier-shape]].',
    ),
  superseded_by: z
    .string()
    .regex(NOTE_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the Note that replaces this one. Required when state is closed/superseded.',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to entities by id ' +
        '(slug optional per [[D-0002-entity-identifier-shape]]), but may also ' +
        'reference non-entity planning docs by their wikilink slug.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    requiredWhen(
      ctx,
      fm.state === 'closed/superseded' && fm.superseded_by === undefined,
      'superseded_by',
    )
  })

export type Note = z.infer<typeof NoteSchema>

/** The Note contract — frontmatter plus a free-form body (no required sections). */
export const NoteContract = contract({
  frontmatter: NoteSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([]),
})
