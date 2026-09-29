/**
 * `CommonFrontmatter` — the shared Zod base every entity type extends.
 *
 * The source of truth for the common frontmatter fields: the 11 per-type
 * `schema.ts` build on it with `CommonFrontmatter.extend({ ... })`, and the
 * JSON consumers read the in-memory `zodToJsonSchema` projection
 * (`_json_schema.ts`) of the result.
 *
 *   - `.default([])` on `related`/`tags`, `.default(false)` on
 *     `need_human_review`: the default fills before the required check, so a
 *     frontmatter that omits `tags:` still validates;
 *   - `tags` is the one common-level required field, expressed as a
 *     defaulted-required array (the default makes the omission valid);
 *   - key declaration order (`type` → `schema_version` → `id` → `state` →
 *     `title` → `created` → `last_reviewed` → `related` → `tags` →
 *     `need_human_review` → `created_at` → `provenance` → `status`) IS the
 *     canonical frontmatter key order, which
 *     `entities migrate` derives from `Object.keys(shape)`.
 *
 * Per-type schemas SPECIALIZE `type` (literal), `id` (prefix pattern),
 * `state` (enum), `related.items` (pattern), and — for Principle — `tags`
 * (a one-of-`principle/<category>` constraint), by passing a narrower field of
 * the same name to `.extend()`. Zod's `.extend()` REPLACES a key in place
 * (keeping its original position), so the override wins without disturbing key
 * order.
 *
 * Common-level fields here carry NO pattern on `id`/`state`/`type` — the bare
 * base, deferring the prefix pattern / enum / const to each per-type schema. A
 * type that forgets to override them would accept any string; every shipped
 * per-type schema overrides all three.
 */

import { z } from 'zod'

/** ISO date `YYYY-MM-DD`. Used by `created`/`last_reviewed`. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Numeric-string schema version (`"0"`, `"1"`, …) for `schema_version`.
 *  Module-local: used only by `CommonFrontmatter` below. */
const SCHEMA_VERSION_PATTERN = /^(0|[1-9][0-9]*)$/

// ---------------------------------------------------------------------------
// Wikilink grammars
//
// Two distinct grammars run across the eleven per-type schemas. Both live here
// and are imported directly — deliberately NOT re-exported under per-type
// aliases, which is how one name (`RELATED_PATTERN`) came to denote FOUR
// different regexes across nine modules.
//
// Per-type schemas that need a NARROWER `related` policy than either of these
// keep their own uniquely-named constant (`PRINCIPLE_RELATED_PATTERN`,
// `PRODUCT_RELATED_PATTERN`). Those are deliberate per-type policy, not
// duplication: folding them in here would WIDEN validation.
// ---------------------------------------------------------------------------

/**
 * Wikilink naming an entity by id: `[[AA-NNNN(.N)?(-slug)?]]`. Entity ids only —
 * a non-entity planning doc (`[[roadmap]]`) does NOT match. Used for `related`
 * on Capability/Driver, `tasks` on Milestone, and `parent`/`depends_on` on Task.
 */
export const ENTITY_WIKILINK_PATTERN =
  /^\[\[[A-Z]{1,3}-[0-9A-Z]{4}(\.\d+)?(-[a-z0-9]+(?:-[a-z0-9]+)*)?\]\]$/

/**
 * Wikilink naming an entity by id OR a non-entity planning doc by slug —
 * `[[D-0002-entity-identifier-shape]]` and `[[roadmap]]` both match. The
 * permissive `related` policy shared by Decision, Milestone, Reference,
 * Standard, and Term.
 */
export const DOC_WIKILINK_PATTERN = /^\[\[[A-Za-z0-9][A-Za-z0-9._/-]*\]\]$/

// Regex-SOURCE fragments (strings, not RegExps — the factories below
// interpolate them) of the canonical id shape `model/identifier.ts` anchors.
// They live HERE rather than beside `ID_RE` because `identifier.ts` imports
// `model/read.ts`, which reaches back into `entities/`; importing the other way
// is a module-init cycle (verified: `CommonFrontmatter` is then read before
// initialization when the first per-type schema calls `.extend`). `ID_RE` /
// `FILENAME_RE` could not have been reused regardless — both are fully
// anchored, generic in prefix, and unconditionally optional in `.N`.

/** The 4-char base-36 id body (`NNNN`). */
const ID_CHARS_SRC = '[0-9A-Z]{4}'
/** The optional `.N` sub-id suffix (Milestone only). */
const SUB_ID_SRC = '(\\.\\d+)?'
/** The optional `-slug` tail of a wikilink. NOT `SLUG_RE` (`@lib/util/slug`) —
 *  that is anchored at both ends, while this is an optional hyphen-prefixed
 *  group. The bodies coincide; the shapes are not substitutable. */
const SLUG_TAIL_SRC = '(-[a-z0-9]+(?:-[a-z0-9]+)*)?'

/** Whether the pattern admits Milestone's `.N` sub-id suffix. */
export interface EntityPatternOptions {
  subId?: boolean
}

/**
 * The per-type `id` pattern for one prefix — `entityIdPattern("D")` is
 * `/^D-[0-9A-Z]{4}$/`, `entityIdPattern("M", { subId: true })` adds `(\.\d+)?`.
 *
 * Emits `.source` BYTE-IDENTICAL to the literals it replaces, which is load
 * bearing: `services/docs/data_model.ts` recovers each type's prefix by
 * string-matching this source (`/^\^([A-Z]{1,3})-/`) and detects sub-id support
 * via `includes("(\\.\\d+)?")`, both through the `zodToJsonSchema` projection.
 * `model/tests/entity-patterns.test.ts` pins every emitted source.
 */
export function entityIdPattern(prefix: string, opts?: EntityPatternOptions): RegExp {
  const sub = opts?.subId === true ? SUB_ID_SRC : ''
  return new RegExp(`^${prefix}-${ID_CHARS_SRC}${sub}$`)
}

/**
 * The wikilink pattern admitting one prefix — `entityWikilinkPattern("C")` is
 * `/^\[\[C-[0-9A-Z]{4}(-[a-z0-9]+(?:-[a-z0-9]+)*)?\]\]$/` — or several, in which
 * case the alternation is parenthesized: `entityWikilinkPattern(["P", "S"])`
 * yields `(P-[0-9A-Z]{4}|S-[0-9A-Z]{4})`.
 *
 * Byte-identity with the replaced literals is pinned the same way as
 * `entityIdPattern`; see that note.
 */
export function entityWikilinkPattern(
  prefix: string | string[],
  opts?: EntityPatternOptions,
): RegExp {
  const prefixes = Array.isArray(prefix) ? prefix : [prefix]
  const ids = prefixes.map((p) => `${p}-${ID_CHARS_SRC}`).join('|')
  const head = prefixes.length > 1 ? `(${ids})` : ids
  const sub = opts?.subId === true ? SUB_ID_SRC : ''
  return new RegExp(`^\\[\\[${head}${sub}${SLUG_TAIL_SRC}\\]\\]$`)
}

// ---------------------------------------------------------------------------
// State-conditional requireds
// ---------------------------------------------------------------------------

/**
 * Emit the JSON-Schema-compatible "required property" issue when a
 * caller-computed condition holds.
 *
 * The predicate is a caller-computed BOOLEAN rather than a field name plus a
 * state value, deliberately: the nine sites test `state` three different ways
 * (`===`, `startsWith("closed/")`, `startsWith("promoted/")`), and computing it
 * at the call site is what keeps the collapse behaviour-preserving while
 * retaining each schema's narrowed `z.enum` literal typing.
 *
 * The message is byte-identical to the AJV phrasing the ops layer and CLI tests
 * assert against (`lib/model/tests/entity.test.ts`,
 * `cli/backlog_cli/tests/create.test.ts`) — do not reword it.
 */
export function requiredWhen(ctx: z.RefinementCtx, when: boolean, field: string): void {
  if (!when) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    message: `'${field}' is a required property`,
  })
}

/**
 * The supersession lifecycle rule pair Decision and Standard share verbatim
 * (each type's JSON declared it as two `allOf` if/then arms): a
 * `closed/superseded` entity must point at its replacement, and a
 * `closed/deprecated` one must explain why.
 */
export const SUPERSESSION_RULES = [
  { state: 'closed/superseded', field: 'superseded_by' },
  { state: 'closed/deprecated', field: 'deprecation_note' },
] as const

// ---------------------------------------------------------------------------
// OKF v0.2 `status` (document maturity) — see the field doc comment below.
// ---------------------------------------------------------------------------

/** The only values OKF v0.2's document-maturity `status` key admits. */
export const OKF_STATUS_VALUES = ['draft', 'stable', 'deprecated'] as const

/**
 * Whether a `status:` value is shaped like this product's own entity
 * lifecycle `state` value rather than an OKF document-maturity value — the
 * signal used to pick a helpful "you probably meant `state:`" message over a
 * generic enum-mismatch one. Matches the lifecycle bands every entity type's
 * `state` enum draws from (`open/*`, `closed/*`, `planning/*`,
 * `in-progress*`); a value outside all four bands (and not a recognized OKF
 * value) gets the generic message instead.
 */
function looksLikeLifecycleValue(value: string): boolean {
  return (
    value.startsWith('open/') ||
    value.startsWith('closed/') ||
    value.startsWith('planning/') ||
    value.startsWith('in-progress')
  )
}

/**
 * The shared frontmatter base. Built as a plain `z.object` whose `.shape`
 * declares the common fields in `_common.json` order; per-type schemas call
 * `CommonFrontmatter.extend({ ... })`.
 *
 * `additionalProperties: false` on every per-type JSON schema is mirrored by
 * Zod's default `.strict()`-free object being *stripping*, NOT rejecting —
 * so per-type schemas append `.strict()` (via the registry helper or directly)
 * to reproduce the "additional property is an error" behaviour. The base
 * itself is left non-strict so `.extend()` can add fields; strictness is
 * applied once, at the per-type leaf, after all extension.
 */
export const CommonFrontmatter = z.object({
  type: z
    .string()
    .describe(
      'Dispatch tag the validator and runtime use to pick this schema. ' +
        'Const-valued per type — each per-type schema overrides this with its own `const`.',
    ),
  schema_version: z
    .string()
    .regex(SCHEMA_VERSION_PATTERN)
    .optional()
    .describe(
      'Numeric string version of the per-type schema this instance conforms to. ' +
        'Compare numerically when ordering versions. Independent of any product ' +
        "version. The value `0` is a documented sentinel meaning 'pre-SDLC-managed' — " +
        'audit treats it as intentional, not stale. Optional in frontmatter: never ' +
        'in any per-type `required` set (audit flags a MISSING stamp as drift, not ' +
        'the validator).',
    ),
  id: z
    .string()
    .describe(
      'Immutable identifier per [[D-0002-entity-identifier-shape]] — `AA-NNNN`. ' +
        'Each per-type schema overrides this with its prefix-specific `pattern`. ' +
        'Never renamed once assigned.',
    ),
  state: z
    .string()
    .describe(
      'Lifecycle state, prefixed `open/*` (active) or `closed/*` (terminal). ' +
        'Each per-type schema overrides this with its own `enum` of legal values.',
    ),
  title: z
    .string()
    .min(1)
    .describe(
      'Human-readable headline. Frontmatter is canonical; the body opens with ' +
        '`# <title>` for readability.',
    ),
  created: z.string().regex(DATE_PATTERN).describe('ISO date the entity was first authored.'),
  last_reviewed: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe(
      'ISO date the entity was last reviewed. Optional: never in any per-type ' + '`required` set.',
    ),
  related: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Cross-references to other entities as wikilinks (slug optional per ' +
        '[[D-0002-entity-identifier-shape]]). Each per-type schema may add an ' +
        '`items.pattern` constraint narrowing the admissible link shapes.',
    ),
  tags: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Free-form labels. Required at the common level, defaulting to `[]`. ' +
        'Per-type schemas may add a `contains` constraint (e.g. Principle requires ' +
        'exactly one `principle/<category>` tag).',
    ),
  need_human_review: z.boolean().default(false).describe('Review-tracking flag.'),
  created_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO 8601 timestamp the entity was authored, finer than `created`. Optional: ' +
        'stamped by tooling that authors entities, never required.',
    ),
  provenance: z
    .string()
    .min(1)
    .optional()
    .describe(
      'What authored the entity when it was not written by hand: a skill invocation, ' +
        'tool, or import source (e.g. `sdlc:capability-map packages/ts`). Optional: ' +
        'absent means hand-authored.',
    ),
  /**
   * OKF v0.2's OWN optional document-maturity key — NOT the entity's own
   * lifecycle `state` field (see [[T-P7F7]], which renamed `status`→`state`
   * for exactly that concept). The two are unrelated and coexist: `state`
   * tracks WHERE an entity sits in its own lifecycle (`planning/draft`,
   * `closed/done`, …); OKF's `status` tracks the MATURITY of the document's
   * content itself (`draft`, `stable`, `deprecated`), independent of
   * lifecycle. Admitted here with a value check (not a bare passthrough — see
   * `OKF_STATUS_VALUES` below) — no per-type schema needs to declare it,
   * since every per-type schema extends this base ([[M-LBU2]] / [[T-I1KJ]]).
   *
   * The check is a `superRefine`, not a plain `z.enum`, so a leftover
   * lifecycle-shaped value (a pre-[[T-P7F7]] `status: open/ready` that was
   * never renamed to `state:`) gets a custom `code: 'custom'` issue whose
   * message says to rename it and run `entities migrate`, instead of the
   * generic enum-mismatch message `markdown-contract`'s formatter would
   * otherwise build from the raw `invalid_value` issue — a `custom` issue is
   * the only code whose `message` it renders verbatim
   * ([#2412](https://github.com/sksizer/dev/pull/2412) review round 1). This is
   * a better error message for the OKF key, not a compat alias: the value
   * still fails validation either way.
   *
   * The `.meta({ enum: [...] })` is NOT redundant with the `superRefine`
   * above: a `superRefine`-only field has no `enum` in its own right, so
   * `z.toJSONSchema()`'s projection (`_json_schema.ts`, consumed by
   * `check_entities.ts` among others) would otherwise show `status` as a
   * bare `{ type: 'string' }` with no allowed-values list — the JSON-Schema
   * projection and the runtime parse are two separate readers of this same
   * field and each needs its own way to see the enum.
   */
  status: z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined) return
      if ((OKF_STATUS_VALUES as readonly string[]).includes(value)) return
      if (looksLikeLifecycleValue(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `'${value}' looks like this entity's lifecycle value, not an OKF document-maturity ` +
            "value — put it under 'state:' instead of 'status:', then run 'entities migrate'.",
        })
        return
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must be one of ${OKF_STATUS_VALUES.map((v) => `'${v}'`).join(',')}`,
      })
    })
    .meta({ enum: [...OKF_STATUS_VALUES] })
    .describe(
      "OKF v0.2's own document-maturity key — DISTINCT from the entity's own lifecycle " +
        '`state` field (do not confuse the two). Optional: absent means OKF makes no ' +
        'maturity claim about this document.',
    ),
})

/** The inferred TS type of the shared base (rarely used directly — per-type
 *  `z.infer` of the extended schema is the consumer-facing type). */
export type CommonFrontmatter = z.infer<typeof CommonFrontmatter>

/**
 * One entity as read: the identifying fields every view of an entity
 * shares. Deliberately wider than `CommonFrontmatter` — plain strings,
 * no enums — because these views read fail-safe from raw frontmatter and
 * a drifted file must still yield one rather than fail the response.
 * Per-type entities extend this; see `capability/schema.ts#CapabilityEntity`.
 */
export const BaseEntity = z.object({
  id: z.string(),
  /** File stem — the handle an entity detail route takes. */
  basename: z.string(),
  title: z.string(),
  state: z.string(),
})

export type BaseEntity = z.infer<typeof BaseEntity>
