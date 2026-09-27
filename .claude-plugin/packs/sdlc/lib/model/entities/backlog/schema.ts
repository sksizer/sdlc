/**
 * Backlog entity — Zod schema.
 *
 * `CommonFrontmatter` base + Backlog-specific fields, `.strict()` for
 * `additionalProperties: false`, plus seven status-conditional `result` rules in
 * one `.superRefine`:
 *
 *   - `promoted/*`        ⇒ `result` is required (must point at the artifact);
 *   - `promoted/task`     ⇒ `result` matches a task wikilink (T-NNNN);
 *   - `promoted/milestone`⇒ `result` matches a milestone wikilink (M-NNNN);
 *   - `promoted/decision` ⇒ `result` matches a decision wikilink (D-NNNN);
 *   - `closed/duplicate`  ⇒ `result` is required AND matches a backlog wikilink;
 *   - `closed/abandoned`  ⇒ `result` must be ABSENT (nothing to point at);
 *   - `closed/delivered`  ⇒ `result` is required (a PR link or a short note of
 *     what shipped — freeform, not wikilink-shaped: the item was built
 *     directly, without going through a promoted artifact).
 *
 * Backlog is deliberately permissive: `type`/`id`/`status` are all optional,
 * since multi-item dump files carry no status. The base `result` field is a
 * freeform non-empty string; the conditional branches narrow its shape to a
 * wikilink per status where one applies.
 *
 * Schema v2 adds `likely_type` — the triager's non-binding guess at what the
 * item becomes (per the [[D-ORMG-data-model]] roster note). A hint only: it
 * never constrains the promotion outcome, which `status`/`result` record.
 */

import { contract, lenientBody } from 'markdown-contract'
import { z } from 'zod'

import {
  CommonFrontmatter,
  entityIdPattern,
  entityWikilinkPattern,
  requiredWhen,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Mirrors `backlog/schema.json` `version`. v2: adds `likely_type`. */
export const SCHEMA_VERSION = '2'

/** Conditional per-status `result` patterns (mirror the JSON if/then branches).
 *  The base `result` field itself carries no shape constraint beyond
 *  non-empty — `closed/delivered` relies on that to accept a freeform PR
 *  link or note. */
export const RESULT_TASK_PATTERN = entityWikilinkPattern('T')
export const RESULT_MILESTONE_PATTERN = entityWikilinkPattern('M', {
  subId: true,
})
export const RESULT_DECISION_PATTERN = entityWikilinkPattern('D')
export const RESULT_BACKLOG_PATTERN = entityWikilinkPattern('B')

/**
 * `status` → the narrowed `result` shape that status demands. Absent key means
 * the status imposes no narrowing beyond the base pattern on the field.
 */
export const RESULT_PATTERN_BY_STATUS: Readonly<Record<string, RegExp>> = {
  'promoted/task': RESULT_TASK_PATTERN,
  'promoted/milestone': RESULT_MILESTONE_PATTERN,
  'promoted/decision': RESULT_DECISION_PATTERN,
  'closed/duplicate': RESULT_BACKLOG_PATTERN,
}

export const BacklogSchema = CommonFrontmatter.extend({
  type: z
    .literal('backlog')
    .optional()
    .describe(
      'Artifact type — used by the frontmatter validator to dispatch to this ' +
        'schema. Optional today (the validator falls back to the parent directory ' +
        'name).',
    ),
  id: z
    .string()
    .regex(entityIdPattern('B'))
    .optional()
    .describe(
      "Immutable identifier per [[D-0002-entity-identifier-shape]]: 'B-' + 4 " +
        'base-36 chars [0-9A-Z]. Matches the filename; never renamed once assigned. ' +
        'Optional on legacy multi-item dump files.',
    ),
  status: z
    .enum([
      'promoted/task',
      'promoted/milestone',
      'promoted/decision',
      'closed/abandoned',
      'closed/duplicate',
      'closed/delivered',
    ])
    .optional()
    .describe(
      'Lifecycle stage. Absent means the file is still a raw idea or an ongoing ' +
        'dump. `promoted/<entity>` records that this backlog file was turned into a ' +
        'real artifact; pair with `result:`. `closed/abandoned`/`closed/duplicate` ' +
        'record discard without promotion. `closed/delivered` records that the item ' +
        'was built directly, without a promoted artifact in between; pair with ' +
        '`result:` (a PR link or a short note of what shipped).',
    ),
  likely_type: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .optional()
    .describe(
      'Non-binding triage hint: the entity-type slug this item will likely ' +
        'become (task, milestone, decision, driver, ...). Recorded by the ' +
        'triager; never constrains the promotion outcome — `status`/`result` ' +
        'record what actually happened.',
    ),
  title: CommonFrontmatter.shape.title.optional(),
  created: CommonFrontmatter.shape.created.optional(),
  result: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Wikilink to the artifact this backlog file resolved to, or — for ' +
        '`closed/delivered` — a freeform PR link or short note of what shipped. ' +
        'Required when `status:` starts with `promoted/`, or is `closed/duplicate` ' +
        "or `closed/delivered`. The conditional rules narrow `result:`'s pattern to " +
        'a wikilink for every status but `closed/delivered`.',
    ),
})
  .strict()
  .superRefine((fm, ctx) => {
    const status = fm.status
    const result = fm.result

    // promoted/* ⇒ result required.
    requiredWhen(
      ctx,
      typeof status === 'string' && status.startsWith('promoted/') && result === undefined,
      'result',
    )

    // Per-status result pattern narrowing (only when result is present — the
    // required check above already covers the absent case for promoted/*).
    if (result !== undefined) {
      const want = RESULT_PATTERN_BY_STATUS[status ?? '']
      if (want !== undefined && !want.test(result)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['result'],
          message: `'${result}' does not match '${want.source}'`,
        })
      }
    }

    // closed/duplicate ⇒ result required.
    requiredWhen(ctx, status === 'closed/duplicate' && result === undefined, 'result')

    // closed/delivered ⇒ result required (freeform PR link or note — no
    // wikilink narrowing; the item was built directly, so there's no
    // artifact to link).
    requiredWhen(ctx, status === 'closed/delivered' && result === undefined, 'result')

    // closed/abandoned ⇒ result must be ABSENT.
    if (status === 'closed/abandoned' && result !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: 'closed/abandoned must not carry a `result:` — there is nothing to point at',
      })
    }
  })

export type Backlog = z.infer<typeof BacklogSchema>

/**
 * The Backlog contract — `BacklogSchema` as the frontmatter plane; the body is
 * deliberately unconstrained (the manifest declares no sections). A backlog is a
 * freeform dump; structure is imposed only at promotion time.
 */
export const BacklogContract = contract({
  frontmatter: BacklogSchema,
  rules: [titleMirrorsH1],
  body: lenientBody([]),
})
