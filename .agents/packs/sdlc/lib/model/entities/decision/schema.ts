/**
 * Decision entity — Zod schema (mirror of `decision/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Decision-specific fields, `.strict()` for the JSON
 * `additionalProperties: false`, plus the two state-conditional requireds the
 * JSON declares via `allOf` if/then — `closed/superseded ⇒ superseded_by` and
 * `closed/deprecated ⇒ deprecation_note` — expressed as a `.superRefine` over
 * the shared `SUPERSESSION_RULES`.
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DOC_WIKILINK_PATTERN,
  entityIdPattern,
  entityWikilinkPattern,
  requiredWhen,
  SUPERSESSION_RULES,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `decision/schema.json` `version`. */
export const SCHEMA_VERSION = '2'

/** Decision-shaped wikilink (slug optional). */
export const DECISION_WIKILINK_PATTERN = entityWikilinkPattern('D')

export const DecisionSchema = CommonFrontmatter.extend({
  type: z.literal('decision').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('D'))
    .describe(
      'Immutable identifier in canonical D-XXXX shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'D-' + 4 chars [0-9A-Z]. Decisions mint " +
        'base-36 ids (moved from incrementing 2026-07-05 — branch-parallel minting kept ' +
        'colliding); legacy sequential D-0001… ids are grandfathered. Never renamed once ' +
        'assigned.',
    ),
  state: z
    .enum(['open/proposed', 'open/accepted', 'closed/superseded', 'closed/deprecated'])
    .default('open/proposed')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'Decisions move from open/proposed → open/accepted; closed/superseded means ' +
        'a newer Decision replaces this one; closed/deprecated means the decision no ' +
        'longer applies.',
    ),
  supersedes: z
    .string()
    .regex(DECISION_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the Decision this one replaces, if any. Slug is optional per ' +
        '[[D-0002-entity-identifier-shape]].',
    ),
  superseded_by: z
    .string()
    .regex(DECISION_WIKILINK_PATTERN)
    .optional()
    .describe(
      'Wikilink to the Decision that replaces this one, if any. Required when ' +
        'state is closed/superseded. Slug is optional per ' +
        '[[D-0002-entity-identifier-shape]].',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to other entities by ' +
        'id (slug optional per [[D-0002-entity-identifier-shape]]), but may also ' +
        'reference non-entity planning docs by their wikilink slug (e.g. [[roadmap]]).',
    ),
  deprecation_note: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Short note on why the decision was deprecated. Required when state is ' + 'deprecated.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    // allOf if/then: a superseded Decision must point at its replacement, and a
    // deprecated one must explain why. `fields` is indexed generically, which
    // costs the narrowed literal typing on those two optional keys but keeps
    // the rule pair identical to Standard's.
    const fields = fm as Record<string, unknown>
    for (const rule of SUPERSESSION_RULES) {
      requiredWhen(ctx, fm.state === rule.state && fields[rule.field] === undefined, rule.field)
    }
  })

export type Decision = z.infer<typeof DecisionSchema>

/**
 * The Decision contract — `DecisionSchema` as the frontmatter plane plus the
 * body grammar from the manifest (order: lenient → `"none"`, `allowUnknown`).
 * The required `Decision` outcome and several optional sections carry aliases.
 */
export const DecisionContract = contract({
  frontmatter: DecisionSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([
    section('Summary'),
    section(['Decision', 'Recommendation', 'Conclusion', 'Resolution']),
    optionalSection('Status'),
    optionalSection(['Context', 'What this is', 'Background']),
    optionalSection(['Why', 'Rationale']),
    optionalSection('Options considered'),
    optionalSection(['Consequences', 'Implications']),
    optionalSection('Migration'),
    optionalSection('Out of scope'),
    optionalSection('Open questions'),
    optionalSection('Notes'),
    optionalSection('References'),
  ]),
})
