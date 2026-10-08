/**
 * Wikilink helpers — the `[[target]]` value form used across entity
 * frontmatter and prose.
 *
 * The scaffolders wrap bare CLI values into `[[...]]` before forwarding them
 * to a create op (the schema stores the wrapped form); readers like the task
 * sorter unwrap `[[...]]` back to the bare target.
 *
 * NOTE: this operates on *runtime values* (`"[[T-0001]]"`), not on schema
 * patterns.
 */

/** A `[[...]]` value whose body is one run of non-`]` characters. */
const WIKILINK_RE = /^\[\[([^\]]+)\]\]$/

/** Wrap a bare target in `[[ ]]`: `T-0001` -> `[[T-0001]]`. */
export function wrapWikilink(target: string): string {
  return `[[${target}]]`
}

/**
 * If `value` is exactly a `[[...]]` wikilink, return its inner target;
 * otherwise return null. `[[A|B]]` and `[[A#h]]` return the raw inner text
 * (`A|B`, `A#h`) — callers that want only the page strip the alias/anchor.
 */
export function unwrapWikilink(value: string): string | null {
  const m = WIKILINK_RE.exec(value)
  return m ? m[1]! : null
}

/** True iff `value` is exactly a single `[[...]]` wikilink. */
export function isWikilink(value: string): boolean {
  return WIKILINK_RE.test(value)
}
