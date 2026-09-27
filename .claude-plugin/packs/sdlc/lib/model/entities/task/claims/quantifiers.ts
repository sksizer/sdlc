/**
 * `quantifiers` claim resolver — flag acceptance criteria that assert over a
 * universal class ("every X", "each Y", "all Z", "sibling W") without either
 * enumerating that class or naming the query that materialises it.
 *
 * The motivating drift: an AC reads "AC-3: every consuming skill is
 * updated" — but the task never enumerates which skills consume the thing, nor
 * names a command that would. Such an AC is unverifiable: the implementer
 * can't tell when it's satisfied, and a reviewer can't either. A universal AC
 * is acceptable ONLY when the universal set is pinned — listed inline, or
 * produced by a named query (a back-ticked command, a glob, an explicit
 * "listed in <section>" pointer).
 *
 * Purely text-shape: no filesystem queries.
 *
 * Heuristic (deliberately conservative — false negatives over false positives):
 *   1. Consider only `- [ ] AC-N:` / `- [x] AC-N:` checklist lines in the
 *      `## Acceptance criteria` section.
 *   2. An AC trips iff it contains a universal-quantifier word AND shows no
 *      "pinning" signal on the same line: a back-ticked token (command, glob,
 *      or path that materialises the set), a glob character, an explicit count
 *      ("the 7 ...", "both ..."), or an enumeration pointer ("listed in",
 *      "enumerated", "named in", "the following").
 */

import { parse, codeBlockLines, sectionSpans } from 'markdown-contract'

import type { ClaimResolver, Finding } from './types.ts'

const RESOLVER_NAME = 'quantifiers'

const AC_LINE_RE = /^\s*[-*]\s*\[[ xX]\]\s*(AC-\d+\b)?/
/** Strip the `- [ ] AC-N:` bookkeeping prefix, leaving the AC's prose payload.
 *  The label itself carries a digit (`AC-1`) and the checkbox brackets — both
 *  would otherwise be misread as pinning signals. */
const AC_PREFIX_RE = /^\s*[-*]\s*\[[ xX]\]\s*(?:AC-\d+\s*:?\s*)?/

/** Universal-quantifier words. `\b`-anchored, case-insensitive. `sibling` is
 *  included per the spec — "every sibling resolver", "each sibling test". */
const QUANTIFIER_RE = /\b(every|each|all|sibling|siblings)\b/i

/** Signals that the universal set is pinned on the same AC line. Any one of
 *  these defuses the quantifier. */
const PINNED_SIGNALS: RegExp[] = [
  /`[^`]+`/, // a back-ticked token (command / glob / path that materialises the set)
  /[*?]/, // a bare glob character
  /\b(the\s+)?\d+\b/, // an explicit count ("the 7 drafts", "both resolvers" handled below)
  /\bboth\b/i, // "both X and Y" pins a 2-set
  /\b(listed|enumerated|named|defined|shown)\s+(in|below|above|at)\b/i,
  /\bthe following\b/i,
  /\bas\s+(listed|enumerated|named)\b/i,
]

interface AcLine {
  text: string
  line: number // 1-indexed into the raw file
}

/** Pull `- [ ] AC-N: ...` lines out of the `## Acceptance criteria` section,
 *  with raw-file line numbers. Fenced code blocks are skipped.
 *
 *  Structure comes from a single mc `parse`: the H2 sections (fence-aware, so a
 *  `##` inside a fenced block is not a heading) locate `## Acceptance criteria`
 *  via `sectionSpans`, and `codeBlockLines` supplies the fenced-code lines to
 *  skip. Because that parse reports absolute source positions (frontmatter
 *  included), the AC line numbers are raw-file-absolute with no offset math. */
function collectAcLines(text: string): AcLine[] {
  const tree = parse(text)
  const docLines = text.split('\n')
  const fencedLines = codeBlockLines(tree)

  const out: AcLine[] = []
  // Every depth-2 `## Acceptance criteria` section (case-insensitive, trimmed),
  // mirroring the old walk that re-armed collection at each matching H2. Each
  // span's body runs from the line after its heading to the line before the
  // next same-depth sibling (or EOF).
  for (const span of sectionSpans(tree.root, docLines.length, { depth: 2 })) {
    if (span.section.name.trim().toLowerCase() !== 'acceptance criteria') continue
    for (let line = span.start; line <= span.end; line++) {
      if (fencedLines.has(line)) continue // opaque: inside a fenced code block
      const raw = docLines[line - 1] as string
      if (AC_LINE_RE.test(raw)) {
        out.push({ text: raw, line })
      }
    }
  }
  return out
}

function isPinned(line: string): boolean {
  return PINNED_SIGNALS.some((re) => re.test(line))
}

export const quantifiersResolver: ClaimResolver = {
  name: RESOLVER_NAME,

  resolve(
    taskBody: string,
    _frontmatter: Record<string, unknown>,
    _projectRoot: string,
  ): Finding[] {
    const findings: Finding[] = []
    for (const ac of collectAcLines(taskBody)) {
      // Evaluate only the AC's prose payload, not the `- [ ] AC-N:` prefix
      // (whose digit + brackets would otherwise read as a pinning count).
      const payload = ac.text.replace(AC_PREFIX_RE, '')
      const q = QUANTIFIER_RE.exec(payload)
      if (!q) continue
      if (isPinned(payload)) continue

      findings.push({
        line: ac.line,
        severity: 'disqualifier',
        message:
          `AC uses the universal quantifier "${(q[1] as string).toLowerCase()}" ` +
          `without enumerating the set or naming a query that materialises it — ` +
          `pin the universal set (list it, cite a command/glob, or point at an enumeration)`,
        resolver: RESOLVER_NAME,
      })
    }
    return findings
  },
}

export default quantifiersResolver
