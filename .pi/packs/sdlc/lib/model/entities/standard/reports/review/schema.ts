/**
 * The `standard-review` report kind: the data-model contract the
 * /sdlc:standard-review skill assembles JSON against — validated and
 * rendered by `sdlc report render standard-review`. The `.describe()`
 * annotations are the authoring doc; `sdlc report get-schema
 * standard-review` emits the same contract as JSON Schema.
 *
 * Same shape as the principle-review kind with standard ids: severity
 * tallies and the findings total are derived by `template.eta`.
 * `finding`/`proseIssue` come from that package's
 * `reviewFindingSchemas('standard')` factory, shared with principle-review
 * ([[T-ZRO1]]).
 *
 * zod/v4 — see `lib/services/report/schema.ts`.
 */

import { join } from 'node:path'

import { z } from 'zod/v4'

import {
  baseReport,
  extraSections,
  reviewFindingSchemas,
  reviewProposal,
  type ReportKind,
} from '@lib/services/report/schema'
import { pluginLibDir } from '@lib/util/plugin-root'

export { findingSeverity } from '@lib/services/report/schema'

export const { finding, proseIssue } = reviewFindingSchemas('standard')

export const standardReviewReport = baseReport.extend({
  standardsReviewed: z
    .number()
    .int()
    .describe('How many open standards were reviewed (some may yield no findings).'),
  topIssues: z
    .array(
      z.object({
        standardIds: z.array(z.string()).min(1).describe('The standard id(s) involved.'),
        summary: z.string().describe('One-paragraph statement of the issue.'),
      }),
    )
    .describe('The most material issues, ranked; typically 3.'),
  crossStandard: z
    .array(
      z.object({
        pair: z
          .tuple([z.string(), z.string()])
          .describe('Two standard ids, or a standard id and a principle id.'),
        issue: z.string().describe('How they contradict or materially overlap.'),
      }),
    )
    .default([]),
  findings: z
    .array(finding)
    .describe('Every confirmed finding, grouped by the template per standard.'),
  proseIssues: z
    .array(proseIssue)
    .default([])
    .describe('Descriptive-yet-succinct findings on the standards’ own text.'),
  proposal: reviewProposal,
  extraSections,
})

export type StandardReviewReport = z.infer<typeof standardReviewReport>

export const standardReviewReportKind: ReportKind = {
  slug: 'standard-review',
  schema: standardReviewReport,
  templatePath: join(
    pluginLibDir(),
    'model',
    'entities',
    'standard',
    'reports',
    'review',
    'template.eta',
  ),
}
