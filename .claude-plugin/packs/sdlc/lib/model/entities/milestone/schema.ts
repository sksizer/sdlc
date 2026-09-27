/**
 * Milestone entity — Zod schema (mirror of `milestone/schema.json`).
 *
 * Per [[T-JO4I-entity-zod-schemas-validation-ops-swap]]: `CommonFrontmatter`
 * base + Milestone-specific fields, `.strict()` for the JSON
 * `additionalProperties: false`, plus the two status-conditional requireds
 * (`closed/* ⇒ completion_note`, `closed/done ⇒ version`). The Milestone `id`
 * admits a `.N` sub-milestone suffix; `version` is product semver (distinct
 * from this schema's own version).
 */

import { contract, lenientBody, optionalSection, section } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  DATE_PATTERN,
  DOC_WIKILINK_PATTERN,
  entityIdPattern,
  ENTITY_WIKILINK_PATTERN,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `milestone/schema.json` `version` (the SCHEMA version, not the
 *  product `version` field). */
export const SCHEMA_VERSION = '1'

/** Product-release semver, optional leading `v`, optional pre-release/build. */
export const MILESTONE_VERSION_PATTERN = /^v?\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/

export const MilestoneSchema = CommonFrontmatter.extend({
  type: z.literal('milestone').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('M', { subId: true }))
    .describe(
      'Immutable identifier in canonical M-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'M-' + 4 chars [0-9A-Z] " +
        '(base-36 numbering; legacy incrementing ids are grandfathered). A `.N` suffix denotes a ' +
        'sub-milestone inserted between top-levels (e.g. M-0001.1). Never renamed ' +
        'once assigned.',
    ),
  status: z
    .enum([
      'open/draft',
      'open/planned',
      'open/active',
      'closed/done',
      'closed/partial',
      'closed/superseded',
      'closed/abandoned',
    ])
    .default('open/draft')
    .describe('Lifecycle stage. open/* states are active; closed/* are terminal.'),
  version: z
    .string()
    .regex(MILESTONE_VERSION_PATTERN)
    .optional()
    .describe(
      'Semver of the product release this milestone targets (and ships as). ' +
        'Milestones are product releases, so version IS roadmap order — ascending ' +
        'semver. Set by a human once known; absent means deferred/unpositioned ' +
        '(sorts last). Required when status is closed/done. Two milestones sharing a ' +
        'version is a defect flagged by project-check (see milestone definition ' +
        "Workflow invariants). Distinct from this schema's own version.",
    ),
  target_date: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe('Aspirational landing date. Not a deadline gate.'),
  tasks: z
    .array(z.string().regex(ENTITY_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Member items. Each entry is a wikilink to a Task (T-NNNN per ' +
        '[[D-0002-entity-identifier-shape]]) or another entity by id. Slug is ' +
        'optional.',
    ),
  related: z
    .array(z.string().regex(DOC_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references. Entries are wikilinks — typically to other entities by ' +
        'id (slug optional per [[D-0002-entity-identifier-shape]]; the decimal ' +
        'sub-milestone form M-NNNN.N is admitted), but may also reference non-entity ' +
        'planning docs by their wikilink slug.',
    ),
  relevance_note: z
    .string()
    .optional()
    .describe('Short note on what shifted since the milestone was planned.'),
  completion_note: z
    .string()
    .min(1)
    .optional()
    .describe('What shipped (or why work stopped). Required for any closed/* status.'),
})
  .strict()
  .superRefine((fm, ctx) => {
    // allOf if/then: closed milestones must record what shipped or why stopped.
    requiredWhen(
      ctx,
      fm.status.startsWith('closed/') && fm.completion_note === undefined,
      'completion_note',
    )
    // allOf if/then: a milestone closed as done must record its shipped version.
    requiredWhen(ctx, fm.status === 'closed/done' && fm.version === undefined, 'version')
  })

export type Milestone = z.infer<typeof MilestoneSchema>

/**
 * The Milestone contract — `MilestoneSchema` as the frontmatter plane plus the
 * body grammar from the manifest (order: lenient → `"none"`, `allowUnknown`).
 * `Deliverables` accepts the `Tasks` alias.
 */
export const MilestoneContract = contract({
  frontmatter: MilestoneSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([
    section('Goal'),
    section('Success criteria'),
    section(['Deliverables', 'Tasks']),
    optionalSection('Out of scope'),
    optionalSection('Risks / open questions'),
  ]),
})
