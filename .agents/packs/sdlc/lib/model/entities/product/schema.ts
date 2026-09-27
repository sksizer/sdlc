/**
 * Product entity — Zod schema (mirror of `product/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Product-specific fields, `.strict()` for the JSON
 * `additionalProperties: false`. A Product is a thing this project builds and
 * ships; it scopes the Drivers and Goals beneath it. Its `related` admits any
 * wikilink target (narrative docs as well as entities).
 */

import { contract, optionalSection, section, sections } from 'markdown-contract'
import { z } from 'zod'

import { CommonFrontmatter, DATE_PATTERN, entityIdPattern } from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `product/schema.json` `version`. */
export const SCHEMA_VERSION = '1'

/**
 * Product `related`: any non-empty, pipe-free wikilink target. Deliberately
 * WIDER than the shared `DOC_WIKILINK_PATTERN` — a Product links out to
 * narrative docs whose slugs the doc grammar does not admit — so it stays a
 * per-type policy rather than folding into `_common.ts`.
 */
export const PRODUCT_RELATED_PATTERN = /^\[\[[^|\]]+\]\]$/

export const ProductSchema = CommonFrontmatter.extend({
  type: z.literal('product').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('PR'))
    .describe(
      'Immutable identifier in canonical PR-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'PR-' + 4 zero-padded chars [0-9A-Z] " +
        "(Products use incrementing numbering; 'P' is taken by Principle). Never " +
        'renamed once assigned.',
    ),
  status: z
    .enum(['open/draft', 'open/active', 'closed/sunset'])
    .default('open/draft')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'open/draft: boundary still being defined; open/active: built and operated; ' +
        'closed/sunset: no longer built or operated.',
    ),
  title: CommonFrontmatter.shape.title.describe(
    'Human-readable product name. Frontmatter is canonical; the body opens with ' +
      '`# <title>` for readability.',
  ),
  created: z.string().regex(DATE_PATTERN).describe('ISO date the product was first authored.'),
  last_reviewed: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe('ISO date the product was last reviewed.'),
  related: z
    .array(z.string().regex(PRODUCT_RELATED_PATTERN))
    .default([])
    .describe(
      'Cross-references as wikilinks. Products may link narrative docs ' +
        '([[vision]]) as well as entities, so any wikilink target is legal.',
    ),
}).strict()

export type Product = z.infer<typeof ProductSchema>

/**
 * The Product contract — `ProductSchema` as the frontmatter plane plus the body
 * grammar from the manifest (`order: "strict"`, but `allowUnknown: true` — only
 * the framing sections are pinned; the middle is free-form).
 */
export const ProductContract = contract({
  frontmatter: ProductSchema,
  rules: [titleMirrorsH1],
  body: sections({ order: 'strict', allowUnknown: true }, [
    section('Summary'),
    section('What it is'),
    section('Boundary'),
    optionalSection('Drivers & goals'),
    optionalSection('Status'),
    optionalSection('References'),
  ]),
})
