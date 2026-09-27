/**
 * Capability entity — Zod schema.
 *
 * `CommonFrontmatter` base + Capability-specific fields, `.strict()` for
 * `additionalProperties: false`. Capability self-nests via `parent_key` to
 * form the capability tree — `parent_key` is the ONLY stored direction;
 * children are derived by inverting it ([[T-SJH1]], schema v2 dropped the
 * hand-maintained `contains` inverse).
 *
 * Schema v2 ([[T-2KK8-capability-kind-grains-and-locations]]) splits the old
 * two-value `kind` (`feature | technical`) into two axes — an optional
 * structural `kind` (11 grains) and `audience` (`user | system`) — and adds
 * `locations[]`, code anchors under the shared five-form Location grammar
 * (`@lib/util/location`).
 */

import { contract, optionalSection, section, strictBody } from 'markdown-contract'
import { z } from 'zod'

import { isValidLocation } from '@lib/util/location'

import {
  CommonFrontmatter,
  DATE_PATTERN,
  BaseEntity,
  entityIdPattern,
  ENTITY_WIKILINK_PATTERN,
  entityWikilinkPattern,
} from '../_common.ts'
import { titleMirrorsH1 } from '../_rules.ts'

/** Current capability schema version. */
export const SCHEMA_VERSION = '2'

/**
 * The 11 structural grains — what KIND of structure the capability names,
 * independent of who consumes it (that is `audience`). Optional: an instance
 * without `kind` is ungraded (regrading the corpus is follow-up triage, not
 * part of the v1→v2 migration).
 */
export const CAPABILITY_KINDS = [
  'system',
  'subsystem',
  'service',
  'workflow',
  'component',
  'datastore',
  'external',
  'module',
  'adapter',
  'generated',
  'page',
] as const

/** Capability-shaped wikilink (slug optional). */
export const CAPABILITY_WIKILINK_PATTERN = entityWikilinkPattern('C')

/**
 * One capability as read — `BaseEntity` plus the two fields every
 * capability view carries. `kind` is null when ungraded; `parent` is the
 * RESOLVED parent id (not the stored `parent_key` wikilink), null for a root.
 * `ops/graph.ts#CapabilityGraphNode` and `ops/coverage.ts#CoverageCapability`
 * extend this.
 */
export const CapabilityEntity = BaseEntity.extend({
  kind: z.string().nullable(),
  parent: z.string().nullable(),
})

export type CapabilityEntity = z.infer<typeof CapabilityEntity>

export const CapabilitySchema = CommonFrontmatter.extend({
  type: z.literal('capability').describe('Dispatch tag for the validator framework.'),
  id: z
    .string()
    .regex(entityIdPattern('C'))
    .describe(
      'Immutable identifier in canonical C-NNNN shape per ' +
        "[[D-0002-entity-identifier-shape]]: 'C-' + 4 zero-padded chars [0-9A-Z] " +
        '(Capabilities use incrementing numbering). Never renamed once assigned.',
    ),
  status: z
    .enum(['open/planned', 'open/building', 'open/verified', 'closed/retired'])
    .default('open/planned')
    .describe(
      'Lifecycle stage. open/* states are active; closed/* are terminal. ' +
        'open/planned: described but not yet built; open/building: implementation in ' +
        'flight; open/verified: implemented and observed working as described; ' +
        'closed/retired: no longer provided.',
    ),
  title: CommonFrontmatter.shape.title.describe(
    'Human-readable name of the capability. Frontmatter is canonical; the body ' +
      'opens with `# <title>` for readability.',
  ),
  kind: z
    .enum(CAPABILITY_KINDS)
    .optional()
    .describe(
      'Structural grain of the capability — what kind of structure it names ' +
        '(system, subsystem, service, workflow, component, datastore, external, ' +
        'module, adapter, generated, page). Absent = ungraded. Orthogonal to ' +
        '`audience`; see capability/definition.md for the grain rubric.',
    ),
  audience: z
    .enum(['user', 'system'])
    .default('system')
    .describe(
      "Which index section the capability belongs to: user (the capability's " +
        'direct consumer is an end user — the old `kind: feature`) or system ' +
        '(consumed by the system itself — the old `kind: technical`).',
    ),
  created: z.string().regex(DATE_PATTERN).describe('ISO date the capability was first authored.'),
  last_reviewed: z
    .string()
    .regex(DATE_PATTERN)
    .optional()
    .describe('ISO date the capability was last reviewed.'),
  parent_key: z
    .union([z.string().regex(CAPABILITY_WIKILINK_PATTERN), z.null()])
    .default(null)
    .describe(
      'Wikilink to the parent Capability, or null for a tree root. Slug is ' +
        'optional per [[D-0002-entity-identifier-shape]].',
    ),
  locations: z
    .array(
      z.string().refine(isValidLocation, {
        message:
          'location must fit the five-form Location grammar: file, ' +
          'file#symbol, file:line, dir/, or glob (no symbol/line on a glob)',
      }),
    )
    .default([])
    .describe(
      'Code anchors realizing the capability, in the five-form Location ' +
        'grammar shared with task touchpoints: `path/to/file.ts`, ' +
        '`path/to/file.ts#symbol`, `path/to/file.ts:42`, `path/to/dir/`, or a ' +
        'glob. Every form degrades to a path/glob. `entities audit` warns ' +
        '(anchor rot) when a stored location no longer resolves in the tree.',
    ),
  related: z
    .array(z.string().regex(ENTITY_WIKILINK_PATTERN))
    .default([])
    .describe(
      'Cross-references to other entities as wikilinks (any AA-NNNN id per ' +
        '[[D-0002-entity-identifier-shape]]). Slug is optional.',
    ),
}).strict()

export type Capability = z.infer<typeof CapabilitySchema>

/**
 * The Capability contract — `CapabilitySchema` as the frontmatter plane plus the
 * body grammar from the manifest (`order: "strict"`, `allowUnknown: false`).
 * First three sections required; the rest tree-root / leaf optionals. `Hook
 * points` carries an alias.
 */
export const CapabilityContract = contract({
  frontmatter: CapabilitySchema,
  rules: [titleMirrorsH1],
  body: strictBody([
    section('Summary'),
    section('Statement'),
    section('What it provides'),
    optionalSection('Contained sub-features'),
    optionalSection('Lifecycle map'),
    optionalSection('Inputs'),
    optionalSection('Outputs'),
    optionalSection(['Hook points', 'Hook points / extension surfaces']),
    optionalSection('Underlying implementation'),
    optionalSection('Notes'),
  ]),
})
