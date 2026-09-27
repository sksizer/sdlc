/**
 * `sdlc backlog update <backlog> --set '<json>'` — apply a JSON object of
 * frontmatter field updates to a backlog document, schema-validated before
 * anything is written.
 *
 * The deterministic verb that retires the hand-Edited frontmatter mutations
 * in /sdlc:backlog-triage (status flips to `promoted/<entity>` /
 * `closed/<reason>`, the `result:` wikilink, `last_reviewed` bumps). One shared
 * `defineUpdateOp` factory (`_update.ts`), registered per mutable entity — only
 * the noun and schema differ ([[D-0007-deterministic-op-substrate]] §2a,
 * Cluster 6).
 *
 * Carry-edges this surface preserves (the backlog schema enforces them via
 * the shared engine's schema gate):
 *   - the `result:` wikilink must be canonical `[[T-NNNN-slug]]` for
 *     `promoted/task`, not a date-prefixed basename;
 *   - `closed/abandoned` FORBIDS `result:` — when a triage flips an item from
 *     a promoted/duplicate state to abandoned it null-deletes `result`
 *     (`--set '{"status":"closed/abandoned","result":null}'`), which the
 *     shared engine's `null`-deletes-key path makes possible;
 *   - `closed/delivered` REQUIRES `result:` — a freeform PR link or short
 *     note of what shipped, for an item built directly without going through
 *     a promoted artifact.
 */

import { defineUpdateOp } from '@lib/model/ops/_update'

export default defineUpdateOp('backlog')
