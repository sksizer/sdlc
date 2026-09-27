/**
 * Pluggable claim-resolver interface for /sdlc:task-ensure-ready.
 *
 * Each "claim kind" a task spec can drift on (cited paths whose parent
 * directory moved, vacuous universal-quantifier ACs, shipped-via-PR
 * statements, cited schema fields, named consuming skills, hardcoded
 * shell-grep recipes, ...) is implemented as a small co-located resolver
 * module that satisfies the `ClaimResolver` contract below. The
 * `solutions/ontological/lib/model/entities/task/claims/index.ts` barrel collects every module into
 * a typed `RESOLVERS` registry; the `sdlc task check-claims` op (`solutions/ontological/lib/model/entities/task/ops/check-claims.ts`)
 * iterates the registry and emits aggregate JSON for the SKILL.md gate.
 *
 * Design notes:
 *   - `Finding.line` mirrors the `line` field the existing parse-helpers
 *     (`parse_touchpoints.ts`, `scan_placeholders.ts`) emit: a 1-indexed
 *     line number into the raw task file, or `null` when the finding has no
 *     single anchoring line.
 *   - `severity` carries `'disqualifier' | 'warning'`. The task-ensure-ready
 *     SKILL.md gate acts only on `'disqualifier'`; no resolver emits
 *     `'warning'` yet — it is the room left for a future warning-only tier.
 *   - `resolver` names the resolver that produced the finding, so the
 *     aggregate JSON keyed by resolver name stays self-describing even after
 *     findings are flattened.
 *   - `resolve()` is synchronous and deterministic. It receives the raw task
 *     body, the parsed frontmatter, and the project root (for filesystem
 *     queries). No LLM judgment, no network beyond a resolver's own explicit
 *     choice (e.g. a future `shipped_claims` resolver shelling `gh`).
 */

/** Severity of a single resolver finding. */
export type Severity = 'disqualifier' | 'warning'

/**
 * One finding produced by a resolver. The shape matches the JSON object the
 * `task check-claims` op emits per finding (minus `resolver`, which the
 * op uses as the aggregate object's key).
 */
export interface Finding {
  /** 1-indexed line into the raw task file, or null when not line-anchored. */
  line: number | null
  /** Whether this finding blocks readiness (`disqualifier`) or is advisory. */
  severity: Severity
  /** Human-readable description of what the resolver flagged. */
  message: string
  /** The `name` of the resolver that produced this finding. */
  resolver: string
}

/**
 * A pluggable claim resolver. Implementations live one-per-file under
 * `solutions/ontological/lib/model/entities/task/claims/` and are registered explicitly in `index.ts`.
 */
export interface ClaimResolver {
  /**
   * Stable identifier for this resolver. Used as the key under which the
   * runner groups this resolver's findings in the aggregate JSON, and as the
   * `resolver` field on each `Finding`. Convention: the module basename
   * without extension (e.g. `"paths"`, `"quantifiers"`).
   */
  readonly name: string

  /**
   * Inspect a task and return zero or more findings.
   *
   * @param body       The raw task markdown (frontmatter included). Resolvers
   *                   that only care about body sections strip the frontmatter
   *                   themselves; passing the raw text keeps line numbers
   *                   1-indexed against the on-disk file. Named `body` (not
   *                   `taskBody`) so a future lift of this interface to a
   *                   cross-entity home is mechanical.
   * @param frontmatter The parsed YAML frontmatter as a plain object.
   * @param projectRoot Absolute path to the project root, for resolvers that
   *                   query the filesystem.
   * @returns A (possibly empty) list of findings. An empty list means the
   *          resolver found nothing to flag.
   */
  resolve(body: string, frontmatter: Record<string, unknown>, projectRoot: string): Finding[]
}
