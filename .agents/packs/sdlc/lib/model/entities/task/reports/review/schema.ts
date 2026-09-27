/**
 * The `task-review` report kind: the data-model contract any producer
 * (today: the /sdlc:task-review skill) assembles JSON against and
 * `sdlc report render task-review` validates with. The `.describe()`
 * annotations are the authoring doc; `sdlc report get-schema task-review`
 * emits the same contract as JSON Schema.
 *
 * Deliberately carries NO derivable fields: counts (definition gaps, closures
 * per kind, tier sizes) are computed by `template.eta` from the rows,
 * so the payload can't state a total its own rows contradict.
 *
 * The general report machinery (engine, registry, ops) stays in
 * `lib/services/report/`; this kind is the task entity's own shape.
 *
 * zod/v4 — see `lib/services/report/schema.ts` for why payload contracts
 * use the v4 subpath while op contracts stay v3.
 */

import { join } from 'node:path'

import { z } from 'zod/v4'

import { baseReport, type ReportKind } from '@lib/services/report/schema'
import { pluginLibDir } from '@lib/util/plugin-root'

/** The per-task 5-way from the task-review SKILL.md step 2 item 6. */
export const taskDecision = z.enum([
  'shipped',
  'obsoleted',
  'relevant-accurate',
  'relevant-drifted',
  'incomplete',
])

export const taskRow = z.object({
  file: z
    .string()
    .describe('Task file basename, e.g. `T-0XV0-orchestrated-sub-agent-design-call-gap.md`.'),
  headline: z.string().describe("The task's one-line headline."),
  status: z.string().describe('Status AFTER this review, e.g. `open/ready` or `closed/done`.'),
  decision: taskDecision,
  impact: z.enum(['high', 'medium', 'low']),
  complexity: z.enum(['small', 'medium', 'large']),
  confidence: z.enum(['high', 'medium', 'low']).describe("Sub-agent's confidence in its decision."),
  definitionGap: z
    .string()
    .nullable()
    .default(null)
    .describe('The `definition_gap:` set this run, or null when the spec passes the contract.'),
  specCompleteness: z
    .string()
    .describe('One line: which implementation-ready sections are present/missing.'),
  keyFindings: z
    .array(z.string())
    .min(1)
    .describe('2-4 bullets, including code citations that informed the decision.'),
  dependencies: z
    .array(z.string())
    .default([])
    .describe('Blocking/unblocking relationships, stated as in step 2 item 8.'),
  tier: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe('Ranking tier (1 do-soon … 4 rewrite-or-drop); null for tasks closed this run.'),
  tierReason: z
    .string()
    .optional()
    .describe('Why this tier — dependency ordering, risk class, effort.'),
})

export const newlyClosedRow = z.object({
  file: z.string(),
  status: z.enum(['closed/done', 'closed/obsoleted']),
  completionNote: z.string().describe('The `completion_note:` written, citing real evidence.'),
})

export const schemaViolationRow = z.object({
  file: z.string(),
  problem: z.string().describe('What the frontmatter validator reported.'),
})

export const taskReviewReport = baseReport.extend({
  filters: z
    .object({
      since: z.string().optional().describe('`--since` filter, when given.'),
      tag: z.string().optional().describe('`--tag` filter, when given.'),
      readOnly: z.boolean().default(false),
    })
    .default({ readOnly: false }),
  tasks: z
    .array(taskRow)
    .describe('One row per unfinished task reviewed — including ones closed this run.'),
  newlyClosed: z
    .array(newlyClosedRow)
    .default([])
    .describe('Tasks whose status changed to closed/* during this run.'),
  schemaViolations: z
    .array(schemaViolationRow)
    .default([])
    .describe('Frontmatter-validator failures surfaced (and ideally fixed) this run.'),
  recommendation: z.object({
    picks: z
      .array(z.object({ file: z.string(), why: z.string() }))
      .describe(
        'The 1-2 specific picks for the next session; empty when there is no good Tier-1 pick.',
      ),
    narrative: z
      .string()
      .describe('The final-recommendation prose — dependency ordering, risk class, effort.'),
  }),
})

export type TaskReviewReport = z.infer<typeof taskReviewReport>

export const taskReviewReportKind: ReportKind = {
  slug: 'task-review',
  schema: taskReviewReport,
  templatePath: join(
    pluginLibDir(),
    'model',
    'entities',
    'task',
    'reports',
    'review',
    'template.eta',
  ),
}
