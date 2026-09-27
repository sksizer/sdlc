/**
 * `task check-claims` op — run every registered claim resolver against a
 * task document and emit the aggregate findings.
 *
 * This is the deterministic tail the /sdlc:task-ensure-ready gate shells
 * (`sdlc task check-claims <task>`), on the op substrate per
 * [[D-0007-deterministic-op-substrate]] §2a.
 *
 * Output contract: one JSON object keyed by resolver name —
 *
 *   {
 *     "paths":       [{ "line": <int|null>, "severity": "disqualifier"|"warning", "message": "<str>" }, ...],
 *     "quantifiers": [ ... ],
 *   }
 *
 * Every registered resolver always appears as a key (empty array when it
 * found nothing), so the gate iterates keys without guessing which
 * resolvers ran. A resolver crash must not take down the whole gate: it is
 * surfaced on stderr and the resolver contributes an empty findings list.
 */

import { z } from 'zod'

import { defineOp } from '@lib/registry'
import { RESOLVERS } from '@lib/model/entities/task/claims'
import type { Finding } from '@lib/model/entities/task/claims'

import { readTaskDoc } from './_task_doc.ts'

const finding = z.object({
  line: z.number().int().nullable(),
  severity: z.enum(['disqualifier', 'warning']),
  message: z.string(),
})

const input = z.object({
  projectRoot: z.string(),
  /** Task-file path (absolute or project-relative) or bare basename. */
  task: z.string(),
})

const output = z.record(z.string(), z.array(finding))

export default defineOp({
  noun: 'task',
  verb: 'check-claims',
  summary: 'Run every claim resolver against a task doc; findings keyed by resolver.',
  // Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2: `check-claims*`) —
  // a lefthook/agent-reached claim resolver no human types. Absent from
  // `sdlc task --help`, revealed by --advanced, still dispatches directly.
  hidden: true,
  input,
  output,
  cli: {
    positionals: ['task'],
  },
  handler: (args, ctx) => {
    const { text, fm } = readTaskDoc(args.projectRoot, args.task)
    const frontmatter = fm ?? {}

    const aggregate: Record<string, Array<Omit<Finding, 'resolver'>>> = {}
    for (const resolver of RESOLVERS) {
      let findings: Finding[]
      try {
        findings = resolver.resolve(text, frontmatter, args.projectRoot)
      } catch (err) {
        // Surface the crash, keep the gate alive: every other resolver's
        // output still reaches the caller.
        ctx.io.stderr(`resolver "${resolver.name}" threw: ${String(err)}\n`)
        findings = []
      }
      aggregate[resolver.name] = findings.map(({ line, severity, message }) => ({
        line,
        severity,
        message,
      }))
    }
    return aggregate
  },
})
