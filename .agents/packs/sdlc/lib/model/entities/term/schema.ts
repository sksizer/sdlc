/**
 * Term entity — Zod schema (mirror of `term/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Term-specific fields, `.strict()` to reproduce the JSON
 * `additionalProperties: false`. This module is the source of truth;
 * `SCHEMA_VERSION` mirrors the version the retired `term/schema.json` carried.
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import { CommonFrontmatter, DOC_WIKILINK_PATTERN, entityIdPattern } from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `term/schema.json` `version`. */
export const SCHEMA_VERSION = '1'

export const TermSchema = CommonFrontmatter.extend({
  type: z.literal('term').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('TM'))
    .describe(
      'Immutable identifier in canonical TM-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'TM-' + 4 zero-padded chars [0-9A-Z] " +
        '(Terms use incrementing numbering). Never renamed once assigned.',
    ),
  status: z
    .enum(['open/draft', 'open/active', 'closed/retired'])
    .default('open/active')
    .describe(
      'Lifecycle stage. open/active: adopted vocabulary, in use today (the ' +
        'default — a term is captured because it is in use); open/draft: proposed ' +
        'vocabulary, not yet settled; closed/retired: no longer used, kept for link ' +
        'stability.',
    ),
  aliases: z
    .array(z.string().min(1))
    .default([])
    .describe(
      "Alternate names for the term (e.g. 'protocol adapter' for Adapter, " +
        "'deterministic tail' for Tail). Rendered beside the term in the generated " +
        'glossary.',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      "The glossary's Source column: wikilinks to the decisions, standards, and " +
        'principles where the term is normative. Entries are wikilinks — typically ' +
        'to entities by id (slug optional per [[D-0002-entity-identifier-shape]]), ' +
        'but may also reference non-entity planning docs by their wikilink slug.',
    ),
}).strict()

export type Term = z.infer<typeof TermSchema>

/**
 * The Term contract — `TermSchema` as the frontmatter plane plus the body
 * grammar from the manifest (order: lenient → `"none"`, `allowUnknown`).
 * `Definition` is the only required section; `Contrast` carries an alias.
 */
export const TermContract = contract({
  frontmatter: TermSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([
    section('Definition'),
    optionalSection(['Contrast', 'Not to be confused with']),
    optionalSection('Notes'),
    optionalSection('References'),
  ]),
})
