/**
 * Reference entity — Zod schema (mirror of `reference/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Reference-specific fields, `.strict()` for the JSON
 * `additionalProperties: false`.
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import { CommonFrontmatter, DOC_WIKILINK_PATTERN, entityIdPattern } from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `reference/schema.json` `version`. */
export const SCHEMA_VERSION = '1'

export const ReferenceSchema = CommonFrontmatter.extend({
  type: z.literal('reference').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('RF'))
    .describe(
      'Immutable identifier in canonical RF-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'RF-' + 4 zero-padded chars [0-9A-Z] " +
        '(References use incrementing numbering). Never renamed once assigned.',
    ),
  status: z
    .enum(['open/draft', 'open/active', 'closed/retired'])
    .default('open/active')
    .describe(
      'Lifecycle stage. open/active: in use — cited by current ' +
        'decisions/standards (the default — a reference is captured because it is ' +
        'leaned on); open/draft: captured, not yet vetted or not yet load-bearing; ' +
        'closed/retired: no longer leaned on, kept for link stability.',
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe(
      'The external location of the source. Optional — a reference may be a book, ' +
        'a local artifact, or offline material. Rendered as the host-labelled Link ' +
        'cell in the generated roster.',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      "The roster's Cited-by column: wikilinks to the decisions, standards, and " +
        'tasks that lean on this source. Entries are wikilinks — typically to ' +
        'entities by id (slug optional per [[D-0002-entity-identifier-shape]]), but ' +
        'may also reference non-entity planning docs by their wikilink slug.',
    ),
}).strict()

export type Reference = z.infer<typeof ReferenceSchema>

/**
 * The Reference contract — `ReferenceSchema` as the frontmatter plane plus the
 * body grammar from the manifest (order: lenient → `"none"`, `allowUnknown`).
 * `Summary` is the only required section.
 */
export const ReferenceContract = contract({
  frontmatter: ReferenceSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([section('Summary'), optionalSection('Material'), optionalSection('Notes')]),
})
