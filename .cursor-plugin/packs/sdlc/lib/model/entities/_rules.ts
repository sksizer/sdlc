/**
 * Shared cross-plane rules registered on every entity contract (see
 * `_contracts.ts`). A `docRule` sees both planes — the parsed frontmatter and
 * the projected body tree — so it can enforce invariants that neither the
 * frontmatter Zod schema nor the body grammar can express alone.
 */
import { docRule } from 'markdown-contract'

/**
 * The frontmatter `title` is canonical (see `_common.ts`); the body must open
 * with `# <title>` mirroring it exactly. This rule makes that an enforced
 * invariant rather than a convention.
 *
 * - Compares against `tree.root.name` — the projection's first body H1, read
 *   through mdast (fence-aware, and inline markup like `` `code` `` is compared
 *   by its rendered text, not its raw backticks).
 * - Reads the RAW frontmatter (`tree.frontmatter.data`), so it still fires when
 *   the frontmatter Zod plane failed for some unrelated reason.
 * - No-op when the frontmatter carries no `title` (e.g. an untitled task): the
 *   title's presence/shape is the frontmatter plane's concern; this rule only
 *   governs the body mirror once a title exists.
 *
 * Finding ids live in their OWN `title/*` namespace — deliberately NOT
 * `frontmatter/*`. This is a cross-plane rule that needs the body, but the
 * authoring/update paths run frontmatter-only validation (`validateFrontmatter`
 * / `applyFrontmatterUpdates`) that selects `frontmatter/*` findings against a
 * body-less source; a `frontmatter/*` id here would false-fire "missing H1"
 * there. The `title/*` namespace keeps this rule out of those frontmatter-only
 * gates, so it only speaks when the full doc (body included) is validated —
 * `readEntity`, `entities validate`, `entities audit`, and `authorEntity`'s
 * post-render body check. `entities audit` treats `title/*` as serious (see
 * `ops/audit.ts`) so a corpus drift still blocks CI; the error level flips
 * `readEntity` / `entities validate` to the fail arm.
 */
export const titleMirrorsH1 = docRule('title/h1', (_doc, ctx, tree) => {
  const data = tree.frontmatter?.data as Record<string, unknown> | null | undefined
  const rawTitle = data?.['title']
  if (typeof rawTitle !== 'string' || rawTitle.trim() === '') return []
  const title = rawTitle.trim()

  const h1 = tree.root.name // first body H1, rendered text, "" when absent
  if (h1 === '') {
    return [
      ctx.finding({
        id: 'title/h1-missing',
        level: 'error',
        message:
          `body has no \`# ${title}\` H1 — the frontmatter title is ` +
          `canonical and the body must open by mirroring it`,
      }),
    ]
  }
  if (h1 !== title) {
    return [
      ctx.finding({
        id: 'title/h1-mismatch',
        level: 'error',
        pos: tree.root.pos,
        message: `body H1 "${h1}" does not match the canonical frontmatter ` + `title "${title}"`,
      }),
    ]
  }
  return []
})
