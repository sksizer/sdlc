/**
 * Roadmap entity — Zod schema (mirror of the milestone/task `schema.ts` shape,
 * per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]).
 *
 * A Roadmap is a living tracking document: `CommonFrontmatter` base +
 * Roadmap-specific fields, `.strict()` for `additionalProperties: false`, plus
 * the one status-conditional required (`closed/* ⇒ completion_note`, mirroring
 * milestone). Unlike Milestone, Roadmap's `id` carries NO sub-id suffix — a
 * roadmap is not something you insert between two others.
 *
 * DESIGN CHOICE — no `versions` field in frontmatter. A roadmap's version
 * sections (`## v0.4.0`, `## v0.5.0`, …) and the milestones each ships live in
 * the BODY as free-form H2 headings with milestone wikilinks, not as a
 * structured frontmatter array. Two reasons: (1) the body already reads as
 * the natural home for an ordered, growing list of dated sections — forcing
 * it into frontmatter would duplicate what the prose says; (2) `roadmap
 * check` (`ops/check.ts`) validates the SAME body structure it renders, so
 * there is exactly one place version/milestone membership lives, with no
 * frontmatter/body drift to reconcile. The `RoadmapContract` body grammar
 * below is deliberately lenient (`allowUnknown`) so those free-form version
 * H2s are accepted without being individually enumerated in the grammar.
 */

import { contract, lenientBody, section } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DOC_WIKILINK_PATTERN,
  entityIdPattern,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors the other per-type schemas' SCHEMA version constant (the SCHEMA
 *  version, not any product/plan version). */
export const SCHEMA_VERSION = '1'

export const RoadmapSchema = CommonFrontmatter.extend({
  type: z.literal('roadmap').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('RM'))
    .describe(
      'Immutable identifier in canonical RM-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'RM-' + 4 chars [0-9A-Z] " +
        '(base-36 numbering). Never renamed once assigned. No sub-id suffix ' +
        '(unlike Milestone) — a roadmap is not inserted between two others.',
    ),
  status: z
    .enum(['open/draft', 'open/active', 'closed/superseded', 'closed/abandoned'])
    .default('open/draft')
    .describe(
      'Lifecycle stage. A roadmap is a living tracking doc, not a shippable ' +
        'unit, so there is deliberately no `closed/done` — it stays ' +
        '`open/active` until replaced (`closed/superseded`) or dropped ' +
        '(`closed/abandoned`).',
    ),
  plan_doc: z
    .string()
    .regex(DOC_WIKILINK_PATTERN)
    .describe(
      'Wikilink to the rationale/planning doc this roadmap tracks against ' +
        '(a non-entity planning doc referenced by its wikilink slug, e.g. ' +
        '`[[sdlc-0.8-plan]]` for `docs/planning/sdlc-0.8-plan.md`).',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to other ' +
        'entities by id (slug optional per [[D-0002-entity-identifier-shape]]), ' +
        'but may also reference non-entity planning docs by their wikilink slug.',
    ),
  completion_note: z
    .string()
    .min(1)
    .optional()
    .describe(
      'What superseded this roadmap (or why it was abandoned). Required for any closed/* status.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    // allOf if/then: a closed roadmap must record why (superseded by what, or
    // why abandoned) — mirrors Milestone's `closed/* ⇒ completion_note` rule.
    requiredWhen(
      ctx,
      fm.status.startsWith('closed/') && fm.completion_note === undefined,
      'completion_note',
    )
  })

export type Roadmap = z.infer<typeof RoadmapSchema>

/**
 * The Roadmap contract — `RoadmapSchema` as the frontmatter plane plus a
 * deliberately loose body grammar: only `Overview` is a declared (required)
 * section. Every other top-level H2 (a version section like `## v0.4.0`, or
 * a non-version one like `## Pre-release`) is an `allowUnknown` section —
 * `roadmap check` (`ops/check.ts`), not this contract, validates that a
 * top-level section's milestone links resolve and stay consistent.
 */
export const RoadmapContract = contract({
  frontmatter: RoadmapSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([section('Overview')]),
})
