/**
 * Principle entity — Zod schema (mirror of `principle/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Principle's per-type specializations. The headline specialization is
 * the `tags` `contains`/minContains:1/maxContains:1 constraint — exactly one
 * `principle/<category>` tag must be present — which the JSON declares as a
 * `contains` on the `tags` array. Zod has no native `contains`, so it is
 * expressed as a `.superRefine` over the `tags` array that flags both the
 * none-present and more-than-one-present cases, attaching the issue at the
 * `tags` path so the validator surfaces it at `/tags` (matching the JSON
 * error location).
 */

import { contract, optionalSection, section, strictBody } from 'markdown-contract'
import { z } from 'zod'

import { CommonFrontmatter, entityIdPattern, entityWikilinkPattern } from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `principle/schema.json` `version`. */
export const SCHEMA_VERSION = '1'

/** The required category tag shape: `principle/<one-of>`. */
export const PRINCIPLE_CATEGORY_PATTERN = /^principle\/(product|technical|project|llm-ai)$/

/**
 * Principle `related`: links to other Principles or Standards only (slug
 * optional). Deliberately NARROWER than the shared `ENTITY_WIKILINK_PATTERN` —
 * a Principle relates to the normative layer, not to arbitrary entities — so it
 * stays a per-type policy rather than folding into `_common.ts`.
 */
export const PRINCIPLE_RELATED_PATTERN = entityWikilinkPattern(['P', 'S'])

export const PrincipleSchema = CommonFrontmatter.extend({
  type: z.literal('principle').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('P'))
    .describe(
      'Immutable identifier in canonical P-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'P-' + 4 zero-padded chars [0-9A-Z] " +
        '(Principles use incrementing numbering). Never renamed once assigned.',
    ),
  status: z
    .enum(['open/draft', 'open/published', 'closed/retired'])
    .default('open/draft')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'open/draft: actively being authored; open/published: stable for downstream ' +
        'reference; closed/retired: the principle no longer drives design judgment ' +
        'but is retained for historical reference.',
    ),
  related: z
    .array(z.string().regex(PRINCIPLE_RELATED_PATTERN))
    .default([])
    .describe(
      'Cross-references to other principles or standards. Slug is optional per ' +
        '[[D-0002-entity-identifier-shape]].',
    ),
  // Per-type `tags` extension: the common base requires `tags` (defaulting to
  // `[]`), but Principle narrows the default to `["principle/project"]` and adds
  // the contains/minContains:1/maxContains:1 rule via the superRefine below.
  tags: z
    .array(z.string().min(1))
    .default(['principle/project'])
    .describe(
      'Free-form labels. MUST include exactly one principle/<category> tag ' +
        '(product | technical | project | llm-ai). Per-type extension of the common ' +
        '`tags` field, adding the `contains`/minContains/maxContains constraint.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    // Mirror the JSON `tags.contains` + minContains:1 + maxContains:1: exactly
    // one `principle/<category>` tag. Attach at /tags so the error location
    // matches the JSON validator's.
    const categoryTags = fm.tags.filter((t) => PRINCIPLE_CATEGORY_PATTERN.test(t))
    if (categoryTags.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tags'],
        message:
          'tags must include exactly one principle/<category> tag ' +
          '(product | technical | project | llm-ai)',
      })
    } else if (categoryTags.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tags'],
        message:
          'tags must include exactly one principle/<category> tag, ' +
          `found ${categoryTags.length}`,
      })
    }
  })

export type Principle = z.infer<typeof PrincipleSchema>

/**
 * The Principle contract — `PrincipleSchema` as the frontmatter plane plus the
 * body grammar from the manifest. `order: "strict"`, `allowUnknown: false`:
 * recognized sections appear in declared relative order; no unknown H2s.
 */
export const PrincipleContract = contract({
  frontmatter: PrincipleSchema,
  rules: [titleMirrorsH1],
  body: strictBody([
    section('Summary'),
    section('Statement'),
    section('Why'),
    section('How it applies'),
    optionalSection('Examples'),
    section('Implications'),
    optionalSection('Notes'),
  ]),
})
