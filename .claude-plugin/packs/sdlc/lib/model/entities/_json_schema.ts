/**
 * In-memory JSON-Schema projection of the entity Zod schemas.
 *
 * The docs generator, entity discovery, and the remaining JSON consumers derive
 * every entity fact from `zodToJsonSchema(EntitySchema)` in memory; there is no
 * on-disk `schema.json` / `_common.json`. This module is the single place that
 * conversion happens — `data_model.ts`, `site.ts`, `site/projections.ts`,
 * `model/entity.ts`, `check_entities.ts`, and `backlog_cli` all route through
 * `jsonSchemaForType` rather than each calling `zodToJsonSchema` on their own.
 *
 * The shape `zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy:
 * "none" })` produces is, for every shipped per-type schema, a flat top-level
 * object:
 *
 *   { type: "object", properties: { … }, required: [ … ],
 *     additionalProperties: false }
 *
 * with `$refStrategy: "none"` inlining the `CommonFrontmatter` base so the
 * `properties` map carries the common fields first, then the per-type extras.
 * Each property carries its `.describe()` text as `description`, its `pattern`
 * (id), `enum` (status), and `const` (type). The conditional-required types
 * (task, milestone, …) are `.superRefine`-wrapped (`ZodEffects`); the converter
 * unwraps them automatically, so the top level always has `properties`.
 *
 * Two facts the converter does NOT carry — because the Zod object schemas don't
 * declare them — are SYNTHESIZED from the registry / per-type module here:
 *
 *   - `version` — the per-type schema version (from the registry's `version`).
 *     The entity reference page and audit read it.
 *   - `title` — synthesized as `<Capitalized type> frontmatter` for the one
 *     consumer that reads it (an entity.ts unit test); no generated page
 *     renders it (the reference page derives its title from the type name).
 *
 * `default` keywords are reproduced by the converter from each field's
 * `.default()`. There is no schema-level `description` — the Zod schemas carry
 * no object-level `.describe()` — so the entity reference page has no
 * Description section; the field-by-field table, enums, and version survive.
 */

import { z } from 'zod'

import { entryForType, entityTypeNames } from './_registry.ts'
import { capitalize } from '@lib/util/strings'

/** A projected JSON-Schema object for one entity type. */
export interface EntityJsonSchema {
  type?: string
  /** Synthesized from the registry version (the old JSON `version` key). */
  version?: string
  /** Synthesized title (the old JSON top-level `title`). */
  title?: string
  required?: string[]
  additionalProperties?: boolean
  properties?: Record<string, EntityJsonSchemaProperty>
  [key: string]: unknown
}

/** One property in a projected entity JSON schema. */
export interface EntityJsonSchemaProperty {
  type?: unknown
  const?: unknown
  enum?: unknown[]
  pattern?: string
  format?: string
  default?: unknown
  description?: string
  items?: unknown
  [key: string]: unknown
}

/**
 * The in-memory JSON-Schema projection of an entity type's Zod schema, or
 * `undefined` when the type is not registered (e.g. a synthetic-fixture type
 * that ships its own on-disk `schema.json` but no Zod schema — those callers
 * keep their JSON fallback). For a registered type the result is the
 * `zodToJsonSchema` output with `version` + `title` synthesized from the
 * registry so it is a drop-in stand-in for the retired on-disk JSON.
 */
export function jsonSchemaForType(type: string): EntityJsonSchema | undefined {
  const entry = entryForType(type)
  if (entry === undefined) return undefined
  // `io: "input"` makes defaulted fields optional (omitted from `required`) —
  // matching the retired `zod-to-json-schema` projection the consumers locked
  // on. Zod v4 inlines the merged CommonFrontmatter base (no `$ref`), so the
  // result is the flat `{ type, properties, required, additionalProperties }`
  // object the docs generator and audit read.
  const js = z.toJSONSchema(entry.schema, { io: 'input' }) as EntityJsonSchema
  // The converter never emits these — synthesize from the registry so the
  // projected object matches what the retired JSON carried.
  js.version = entry.version
  js.title = `${capitalize(type)} frontmatter`
  return js
}

/** Every registered entity type name, sorted — the discovery roster the docs
 *  generator and entity discovery walk (replacing the `schema.json`-presence
 *  filesystem filter). */
export function entityTypeNamesForDocs(): string[] {
  return entityTypeNames()
}

/** True iff `type` is a registered entity type (has a Zod schema). Replaces the
 *  retired `existsSync(<type>/schema.json)` "is this an entity type" gate. */
export function isEntityType(type: string): boolean {
  return entryForType(type) !== undefined
}
