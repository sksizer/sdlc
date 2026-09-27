/**
 * `paths` claim resolver — fuzzy-locate cited paths whose basename matches an
 * existing file but whose parent directory does not.
 *
 * The motivating drift: a task body cites `solutions/ontological/skills/foo/bar.ts`,
 * but `bar.ts` has since moved to `solutions/ontological/lib/foo/bar.ts`. A uniquely-named
 * basename elsewhere in the tree is almost certainly the intended target. The
 * plain existence check (parse_touchpoints, for table rows) reports the miss
 * but can't suggest the fix; this resolver finds the relocated file and names it.
 *
 * Scope and precision:
 *   - Only back-ticked, path-shaped tokens in prose are considered (a token
 *     containing `/` and ending in a recognised source extension). This keeps
 *     the resolver from flagging arbitrary identifiers.
 *   - A token is flagged ONLY when (a) the cited path does not exist under the
 *     project root, AND (b) exactly one file with that basename exists
 *     elsewhere in the tree. Zero matches → the path is simply wrong, not
 *     relocated (left to the existence check). Multiple matches → ambiguous,
 *     no confident relocation to suggest.
 *   - Inline-code spans are NOT masked: paths in this corpus are
 *     conventionally written inside inline-code backticks, so masking them
 *     would defeat the resolver. Fenced *blocks* are skipped, matching how
 *     scan_placeholders treats them — a path inside a shell-snippet fence is
 *     illustrative, not a citation.
 *   - The filesystem walk skips `.git`, `node_modules`, and `.sdlc` so a
 *     worktree's own runtime/baseline dirs don't pollute matches.
 */

import { existsSync, readdirSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

import { parse, codeBlockLines } from 'markdown-contract'

import type { ClaimResolver, Finding } from './types.ts'

const RESOLVER_NAME = 'paths'

/** Source extensions a cited path may carry. Mirrors the relevance-check regex
 *  in task-work's SKILL.md (rs/ts/tsx/vue/js/md/toml/json/sql) plus py for the
 *  pre-migration citations still in older specs. */
const PATH_EXT_RE = /\.(rs|ts|tsx|vue|js|mjs|cjs|md|toml|json|sql|py|yml|yaml|sh)$/

/** Inline-code spans, captured so we can pull path tokens out of them. */
const INLINE_CODE_RE = /`([^`\n]+)`/g

/** Directories never worth walking when searching for a relocated basename. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sdlc'])

interface PathCitation {
  path: string
  line: number // 1-indexed into the raw file
}

/** Collect back-ticked, path-shaped citations from the doc, skipping fenced
 *  code blocks. Line numbers are 1-indexed against the raw file: a single mc
 *  `parse` reports absolute source positions (frontmatter included), so the
 *  source-line index needs no offset rebasing, and `codeBlockLines` supplies
 *  the fenced-code lines to skip instead of a hand-rolled fence state machine. */
function collectCitations(text: string): PathCitation[] {
  const citations: PathCitation[] = []
  const tree = parse(text)
  const docLines = text.split('\n')
  const fencedLines = codeBlockLines(tree)

  for (let line = 1; line <= docLines.length; line++) {
    if (fencedLines.has(line)) continue // opaque: inside a fenced code block
    const raw = docLines[line - 1] as string
    let m: RegExpExecArray | null
    INLINE_CODE_RE.lastIndex = 0
    while ((m = INLINE_CODE_RE.exec(raw)) !== null) {
      const token = (m[1] as string).trim()
      if (isPathCitation(token)) {
        citations.push({ path: token, line })
      }
    }
  }
  return citations
}

/** A token is a path citation iff it contains a path separator and ends in a
 *  recognised source extension. Trailing `#symbol` / `:line` suffixes (the
 *  Location grammar) are tolerated by stripping them before the test. */
function isPathCitation(token: string): boolean {
  const bare = stripLocationSuffix(token)
  if (!bare.includes('/')) return false
  if (/[*?[\]]/.test(bare)) return false // globs are not single citations
  if (bare.endsWith('/')) return false // directories handled elsewhere
  return PATH_EXT_RE.test(bare)
}

/** Drop a `#symbol` or `:line` Location-grammar suffix, returning the bare
 *  path. */
function stripLocationSuffix(token: string): string {
  const hash = token.indexOf('#')
  let t = hash >= 0 ? token.slice(0, hash) : token
  const colon = /:(\d+)$/.exec(t)
  if (colon) t = t.slice(0, colon.index)
  return t
}

/** Recursively collect every file basename -> list of relative paths under
 *  root, skipping SKIP_DIRS. Cached per-root within a single resolve() call. */
function indexBasenames(root: string): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        stack.push(join(dir, entry.name))
      } else if (entry.isFile()) {
        const rel = join(dir, entry.name).slice(root.length + 1)
        const bn = entry.name
        const list = index.get(bn)
        if (list) list.push(rel)
        else index.set(bn, [rel])
      }
    }
  }
  return index
}

function existsUnderRoot(root: string, relOrAbs: string): boolean {
  const abs = relOrAbs.startsWith(sep) ? relOrAbs : join(root, relOrAbs)
  return existsSync(abs)
}

export const pathsResolver: ClaimResolver = {
  name: RESOLVER_NAME,

  resolve(taskBody: string, _frontmatter: Record<string, unknown>, projectRoot: string): Finding[] {
    const citations = collectCitations(taskBody)
    if (citations.length === 0) return []

    const findings: Finding[] = []
    let index: Map<string, string[]> | null = null
    const seen = new Set<string>()

    for (const cite of citations) {
      const bare = stripLocationSuffix(cite.path)
      if (seen.has(bare)) continue
      seen.add(bare)

      if (existsUnderRoot(projectRoot, bare)) continue // path resolves: fine

      // Cited path is missing. Is there exactly one same-basename file
      // elsewhere (a relocation), as opposed to zero (plain-wrong) or many
      // (ambiguous)?
      if (index === null) index = indexBasenames(projectRoot)
      const bn = basename(bare)
      const matches = index.get(bn) ?? []
      if (matches.length !== 1) continue
      const relocated = matches[0] as string
      if (relocated === bare) continue // identical (defensive; existsSync miss)

      findings.push({
        line: cite.line,
        severity: 'disqualifier',
        message:
          `cited path \`${cite.path}\` does not exist, but \`${relocated}\` ` +
          `has the same basename — the file likely moved; update the citation`,
        resolver: RESOLVER_NAME,
      })
    }

    return findings
  },
}

export default pathsResolver
