/**
 * Slug helpers — the kebab-case shape (`SLUG_RE`), the slugifier (`slugify`
 * re-exported from identifier.ts), and the freeform-headline→slug derivation
 * (`deriveSlug` + `SLUG_MAX_LEN`).
 *
 * This module is the single source of truth for slug mechanics. `SLUG_RE` is
 * the canonical "is this a valid kebab-case slug" matcher. `deriveSlug`
 * applies `slugify`'s normalization plus a length cap that never cuts mid-word.
 */

export { slugify } from '@lib/model/identifier'

/**
 * Kebab-case slug: lowercase alphanumeric segments joined by single hyphens,
 * no leading/trailing/doubled hyphens. Anchored at both ends.
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Cap derived slugs so a long headline does not yield an unwieldy filename. */
export const SLUG_MAX_LEN = 60

/**
 * Derive a kebab-case slug from a freeform headline/title.
 *
 * Normalizes like `slugify` (lowercase, non-alphanumeric runs → `-`, trim
 * leading/trailing `-`) and then enforces `SLUG_MAX_LEN` (default 60). When
 * the cap lands INSIDE a word the partial trailing segment is dropped
 * ("…-to-its-a" → "…-to-its") rather than left as a fragment; a single
 * segment longer than the cap keeps the hard cut (an empty slug helps
 * nobody). Throws when the input has no alphanumeric content — there is no
 * slug to derive and the caller must pass one explicitly.
 *
 * Single source of truth for the derivation (the backlog-capture tail, the
 * per-entity `create` ops, and the `preview-id` op all reach for this).
 */
export function deriveSlug(headline: string, maxLen = SLUG_MAX_LEN): string {
  // Inline normalization (NOT `slugify`): `slugify` strips a trailing `.md`
  // before collapsing, which would change a headline ending in ".md"
  // ("foo.md" → "foo" instead of "foo-md"). Preserving the backlog tail's
  // exact pre-extraction behavior matters more than the marginal reuse, so
  // this keeps the lowercase / collapse / trim it always carried.
  const lowered = headline.toLowerCase()
  const collapsed = lowered.replace(/[^a-z0-9]+/g, '-')
  let trimmed = collapsed.replace(/^-+|-+$/g, '')
  if (trimmed.length > maxLen) {
    let cut = trimmed.slice(0, maxLen)
    // Never cut mid-word: when the cap lands inside a segment, drop the
    // partial segment ("…-to-its-a" → "…-to-its"). A single segment longer
    // than the cap keeps the hard cut — an empty slug helps nobody.
    if (trimmed[maxLen] !== '-') {
      const lastDash = cut.lastIndexOf('-')
      if (lastDash > 0) cut = cut.slice(0, lastDash)
    }
    trimmed = cut.replace(/-+$/, '')
  }
  if (trimmed === '') {
    throw new Error(
      `could not derive a slug from headline '${headline}' — ` +
        'it has no alphanumeric content. Pass --slug explicitly.',
    )
  }
  return trimmed
}
