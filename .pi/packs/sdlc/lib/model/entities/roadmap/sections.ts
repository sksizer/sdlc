/**
 * Shared roadmap body-scan primitives for `./ops/check.ts` and
 * `./ops/progress.ts`: both walk the SAME shape — top-level H2 sections
 * (version sections like `## v0.4.0`, and any other top-level H2 carrying
 * milestone-link bullets, e.g. a `## Pre-release` phase-0 section) scanned
 * for `[[M-XXXX]]`-style milestone wikilinks — but report different things
 * off it: `check` emits findings per raw occurrence, `progress` rolls
 * occurrences up into per-section milestone progress. A clean third module,
 * rather than one op exporting to the other, so neither op's import surface
 * grows for the other's sake (the same import-shape concern `progress.ts`'s
 * own doc comment raises about `dashboard/server.ts`).
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parse, sectionsAt, blocksOfKind } from 'markdown-contract'

import { OpError } from '@lib/registry'
import { isDir, isFile } from '@lib/util/fs'
import { resolveTarget } from '@lib/model/corpus'
import { resolveInstanceDocPath } from '@lib/model/read'
import { cmpStr } from '@lib/util/strings'
import { pluralize } from '@lib/util/naming'

/** A wikilink target that names a Milestone: `M-XXXX`, optionally with the
 *  `.N` sub-id suffix and/or a `-slug` tail. */
export const MILESTONE_TARGET_RE = /^M-[0-9A-Z]{4}(\.\d+)?(-[a-z0-9]+(?:-[a-z0-9]+)*)?$/

/** Every `[[target]]` / `[[target|alias]]` / `[[target#frag]]` occurrence in
 *  free text, capturing just `target`. Mirrors the recognition regex
 *  `@lib/util/site_table.ts#transformWikilinks` uses for the same shape. */
export const WIKILINK_SCAN_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g

/** One milestone-wikilink occurrence found under a top-level section. */
export interface MilestoneLinkOccurrence {
  sectionName: string
  /** Raw wikilink target as written (may include a slug). */
  target: string
  /** Resolved corpus basename, or `null` when it doesn't resolve. */
  resolved: string | null
  /** The enclosing list item's full text (wikilink included) — callers that
   *  need surrounding prose (e.g. `check.ts`'s stale-link "carries a note"
   *  check) read it off here. */
  itemText: string
  line: number
}

/** Every milestone-wikilink occurrence under every top-level H2 section of
 *  `text`, in document order — version sections (`## v0.4.0`) and any other
 *  section carrying milestone-link bullets alike (e.g. a `## Pre-release`
 *  phase-0 section that precedes the first versioned release). A section
 *  with no milestone wikilinks in it (e.g. `## Overview`) simply contributes
 *  no occurrences; a non-milestone wikilink (e.g. a decision cited as
 *  rationale) is ignored. Undeduped and includes unresolved targets —
 *  callers that want a deduped, resolved-only view (like `progress.ts`)
 *  filter/dedupe themselves. */
export function scanTopLevelMilestoneLinks(
  text: string,
  corpusBasenames: Set<string>,
): MilestoneLinkOccurrence[] {
  const tree = parse(text)
  const occurrences: MilestoneLinkOccurrence[] = []
  for (const top of sectionsAt(tree.root, 2)) {
    const sectionName = top.name.trim()
    for (const list of blocksOfKind(top, 'list', { recursive: true })) {
      for (const item of list.items) {
        WIKILINK_SCAN_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = WIKILINK_SCAN_RE.exec(item.text)) !== null) {
          const target = (m[1] as string).trim()
          if (!MILESTONE_TARGET_RE.test(target)) continue
          occurrences.push({
            sectionName,
            target,
            resolved: resolveTarget(target, corpusBasenames),
            itemText: item.text,
            line: item.pos.line,
          })
        }
      }
    }
  }
  return occurrences
}

// ---------------------------------------------------------------------------
// Roadmap-file discovery — shared by `./ops/check.ts` and `./ops/progress.ts`
// for the same reason `scanTopLevelMilestoneLinks` above is: both walk the
// exact same `id → path(s)` resolution, and a per-op copy of it (this was
// one, verbatim, until this extraction) drifts silently the moment one op's
// copy gets a fix the other's doesn't.
// ---------------------------------------------------------------------------

/** Every roadmap file under `docs/planning/roadmaps/` (README/index skipped),
 *  sorted. `[]` when the directory doesn't exist. */
export function discoverRoadmapFiles(planningRoot: string): string[] {
  const dir = join(planningRoot, pluralize('roadmap'))
  if (!isDir(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    if (/^(README|index)\.md$/i.test(name)) continue
    out.push(join(dir, name))
  }
  return out.sort(cmpStr)
}

/**
 * The roadmap file path(s) a `roadmap check`/`roadmap progress` call should
 * walk: `id`'s resolved file alone when given, else every
 * {@link discoverRoadmapFiles} result. Throws `OpError('INVALID_INPUT', …)`
 * when `id` is given but resolves to no file — the one error both ops throw
 * for this today, so a caller mapping it to an HTTP 404
 * (`dashboard/server.ts`'s `/api/roadmap/progress`) can keep doing so.
 */
export function resolveRoadmapPaths(
  projectRoot: string,
  planningRoot: string,
  id?: string,
): string[] {
  if (id === undefined) return discoverRoadmapFiles(planningRoot)
  const path = resolveInstanceDocPath('roadmap', projectRoot, id)
  if (!isFile(path)) {
    throw new OpError('INVALID_INPUT', `roadmap file not found: ${path}`)
  }
  return [path]
}
