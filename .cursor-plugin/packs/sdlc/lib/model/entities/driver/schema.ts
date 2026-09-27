/**
 * Driver entity — Zod schema (mirror of `driver/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Driver-specific fields, `.strict()` for the JSON
 * `additionalProperties: false`. A Driver is a motivating force behind a
 * Product (the root of the why chain). `kind` and `product` are required (the
 * JSON lists them in `required`); `product` is a PR-NNNN wikilink.
 */

import { contract, optionalSection, section, strictBody } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DATE_PATTERN,
  entityIdPattern,
  ENTITY_WIKILINK_PATTERN,
  entityWikilinkPattern,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `driver/schema.json` `version`. */
export const SCHEMA_VERSION = '1'

/** Product-shaped wikilink (slug optional). */
export const PRODUCT_WIKILINK_PATTERN = entityWikilinkPattern('PR')

export const DriverSchema = CommonFrontmatter.extend({
  type: z.literal('driver').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('DR'))
    .describe(
      'Immutable identifier in canonical DR-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'DR-' + 4 zero-padded chars [0-9A-Z] " +
        "(Drivers use incrementing numbering; 'D' is taken by Decision). Never " +
        'renamed once assigned.',
    ),
  status: z
    .enum(['open/proposed', 'open/validated', 'closed/resolved', 'closed/retired'])
    .default('open/proposed')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'open/proposed: hypothesized, not yet evidence-backed; open/validated: ' +
        'backed by cited evidence; closed/resolved: the driver has been fully ' +
        'addressed; closed/retired: no longer motivating work.',
    ),
  title: CommonFrontmatter.shape.title.describe(
    'Human-readable headline stating the driver in one line. Frontmatter is ' +
      'canonical; the body opens with `# <title>` for readability.',
  ),
  kind: z
    .enum(['pain-point', 'use-case', 'opportunity'])
    .describe(
      'The flavour of motivation: pain-point (friction to remove), use-case ' +
        '(workflow to enable), or opportunity (upside to capture).',
    ),
  product: z
    .string()
    .regex(PRODUCT_WIKILINK_PATTERN)
    .describe(
      'Wikilink to the Product this driver motivates (PR-NNNN per ' +
        '[[D-0002-entity-identifier-shape]]). Slug is optional.',
    ),
  created: z.string().regex(DATE_PATTERN).describe('ISO date the driver was first authored.'),
  last_reviewed: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe('ISO date the driver was last reviewed.'),
  related: z
    .array(z.string().regex(ENTITY_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references to other entities as wikilinks (any AA-NNNN id per ' +
        '[[D-0002-entity-identifier-shape]]). Slug is optional.',
    ),
}).strict()

export type Driver = z.infer<typeof DriverSchema>

/**
 * The Driver contract — `DriverSchema` as the frontmatter plane plus the body
 * grammar from the manifest (`order: "strict"`, `allowUnknown: false`). All four
 * narrative sections are required; `Notes` is optional.
 */
export const DriverContract = contract({
  frontmatter: DriverSchema,
  rules: [titleMirrorsH1],
  body: strictBody([
    section('Statement'),
    section('Who/what it affects'),
    section('Evidence'),
    section('Toward resolution'),
    optionalSection('Notes'),
  ]),
})
