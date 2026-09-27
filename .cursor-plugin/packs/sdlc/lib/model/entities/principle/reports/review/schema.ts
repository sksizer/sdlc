/**
 * The `principle-review` report kind: the data-model contract any producer
 * (today: the /sdlc:principle-review skill) assembles JSON against —
 * validated and rendered by `sdlc report render principle-review`. The
 * `.describe()` annotations are the authoring doc; `sdlc report get-schema
 * principle-review` emits the same contract as JSON Schema.
 *
 * Carries no derivable fields: severity tallies and the findings total are
 * computed by `template.eta` from the findings rows.
 *
 * The general report machinery (engine, registry, ops) stays in
 * `lib/services/report/`; this kind is the principle entity's own shape.
 *
 * zod/v4 — see `lib/services/report/schema.ts` for why payload contracts
 * use the v4 subpath while op contracts stay v3.
 */

import { join } from 'node:path'

import { z } from 'zod/v4'

import {
  baseReport,
  extraSections,
  reviewProposal,
  type ReportKind,
} from '@lib/services/report/schema'
import { pluginLibDir } from '@lib/util/plugin-root'

export const findingSeverity = z.enum(['clear-violation', 'tension', 'drift'])

export const finding = z.object({
  principleId: z.string().describe('e.g. `P-0001`.'),
  principleSlug: z.string().describe('e.g. `prefer-deterministic-over-llm`.'),
  where: z.string().describe('Real location: `path` or `path:line`.'),
  evidence: z.string().describe('Short quote or concrete reference at that location.'),
  why: z.string().describe('Why it contradicts or undercuts the principle.'),
  severity: findingSeverity,
  trackedBy: z
    .array(z.string())
    .default([])
    .describe('Open task ids whose completion would resolve this; empty = untracked gap.'),
})

/** A descriptive-yet-succinct finding on a principle's own prose. */
export const proseIssue = z.object({
  principleId: z.string().describe('e.g. `P-0001`.'),
  principleSlug: z.string().describe('e.g. `prefer-deterministic-over-llm`.'),
  section: z.string().describe('Body H2 the issue sits in, e.g. `Why`.'),
  direction: z
    .enum(['under-described', 'over-long'])
    .describe(
      'under-described: a reader cannot apply the section without guessing; over-long: text that adds no meaning.',
    ),
  evidence: z.string().describe('Short quote, or what is missing.'),
  fix: z.string().describe('The concrete rewrite, addition, or cut.'),
})

export const principleReviewReport = baseReport.extend({
  principlesReviewed: z
    .number()
    .int()
    .describe('How many non-retired principles were reviewed (some may yield no findings).'),
  topIssues: z
    .array(
      z.object({
        principleIds: z.array(z.string()).min(1).describe('The principle id(s) involved.'),
        summary: z.string().describe('One-paragraph statement of the issue.'),
      }),
    )
    .describe('The most material issues, ranked; typically 3.'),
  crossPrinciple: z
    .array(
      z.object({
        pair: z.tuple([z.string(), z.string()]).describe('The two principle ids.'),
        issue: z.string().describe('How they contradict or materially overlap.'),
      }),
    )
    .default([]),
  findings: z
    .array(finding)
    .describe('Every confirmed finding, grouped by the template per principle.'),
  proseIssues: z
    .array(proseIssue)
    .default([])
    .describe('Descriptive-yet-succinct findings on the principles’ own text.'),
  proposal: reviewProposal,
  extraSections,
})

export type PrincipleReviewReport = z.infer<typeof principleReviewReport>

export const principleReviewReportKind: ReportKind = {
  slug: 'principle-review',
  schema: principleReviewReport,
  templatePath: join(
    pluginLibDir(),
    'model',
    'entities',
    'principle',
    'reports',
    'review',
    'template.eta',
  ),
}
