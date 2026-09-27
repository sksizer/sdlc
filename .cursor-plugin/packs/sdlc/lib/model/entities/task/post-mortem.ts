/**
 * The task `## Post-mortem` body-section API.
 *
 * `## Post-mortem` is a task-body section — its H2, its caption, and its three
 * H3 subsections are task domain literals, not generic markdown machinery — so
 * the stub renderer and its detector live beside the task's other body/
 * frontmatter helpers (`prs.ts` is the precedent), not inside the one skill
 * script that happened to plant it first.
 *
 * Two writers share these literals: `/sdlc:task-work` (which *fills* the stub
 * at Step 8) and `sdlc task close-commit` (which *plants* it during the
 * terminal close mutation when the body never got one). Single-sourcing them
 * here is what keeps the anchor Step 8 fills and the anchor close plants byte
 * identical.
 */

import { joinFrontmatterFences, splitFrontmatterFences } from '@lib/util/frontmatter'

/**
 * Line-anchored, case-sensitive detector for an already-present
 * `## Post-mortem` H2 in a task body. When this matches, the body is already
 * stubbed (or filled) and the append is skipped — the guard that makes every
 * stub-append idempotent.
 */
export const POST_MORTEM_H2_RE = /^## Post-mortem\s*$/m

/**
 * The three H3 subsections the post-mortem stub seeds, in the order
 * `/sdlc:task-work` Step 8 documents them as the structure source.
 */
export const POST_MORTEM_H3S = [
  '### Acceptance criteria coverage',
  '### What worked',
  '### Friction and automation gaps',
] as const

export const POST_MORTEM_TBD_LINE = '_TBD — filled at Step 8._'

/**
 * Render the `## Post-mortem` template stub appended to the end of a task body
 * when one is absent. Single-sourced here so the literal — the H2, the caption,
 * and the three H3 headings — has exactly one home; `/sdlc:task-work` Step 8
 * then *fills* this stub rather than authoring its placement or structure.
 *
 * The caption stamps a UTC date; the three subsections each carry one
 * `_TBD — filled at Step 8._` placeholder.
 */
export function renderPostMortemStub(today: string): string {
  const sections = POST_MORTEM_H3S.map((h3) => `${h3}\n\n${POST_MORTEM_TBD_LINE}`).join('\n\n')
  return (
    `## Post-mortem\n\n` +
    `_Captured by /sdlc:task-work on ${today}. PR: pending._\n\n` +
    `${sections}\n`
  )
}

/** True when `body` (the POST-frontmatter body) already carries the H2. */
export function hasPostMortem(body: string): boolean {
  return POST_MORTEM_H2_RE.test(body)
}

/**
 * Append `stub` to the end of `body`, normalizing so exactly one trailing
 * blank line separates the prior content from the stub. Idempotent on
 * trailing whitespace: any run of trailing newlines collapses to the single
 * "`\n\n`" gap before the stub.
 */
export function appendStubToBody(body: string, stub: string): string {
  const trimmed = body.replace(/\n+$/, '')
  return `${trimmed}\n\n${stub}`
}

/**
 * Document-level append: given a task file's FULL text, return the text with
 * the post-mortem stub appended, or `null` when the body already carries a
 * `## Post-mortem` H2 (the idempotent no-op) or the document has no
 * frontmatter block to split on.
 *
 * The detection runs against the post-frontmatter body, so a `## Post-mortem`
 * substring inside the frontmatter block (where it cannot be a line-anchored
 * H2 anyway) never suppresses the append. The document's own fences are
 * preserved verbatim — only the body's tail grows.
 */
export function appendPostMortemStub(text: string, today: string): string | null {
  const parts = splitFrontmatterFences(text)
  if (parts === null) return null
  if (hasPostMortem(parts.body)) return null
  return joinFrontmatterFences(
    {
      openFence: parts.openFence,
      closeFence: parts.closeFence,
      body: appendStubToBody(parts.body, renderPostMortemStub(today)),
    },
    parts.yaml,
  )
}
