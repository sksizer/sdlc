/**
 * The block types a canvas document is composed from. Each is small and
 * reusable; a page is any list of them. `blocks/index.ts` maps a type to its
 * renderer and checker.
 *
 * Anchors are W3C Web Annotation selectors. Prefer the quote form: agents are
 * reliable at quoting a fragment and unreliable at counting characters.
 */
import type { Node } from '../lib/doc.ts'

export interface BlockBase extends Node {
  type: string
  /** Optional heading above the block on the left. */
  title?: string
}

// ---------------------------------------------------------------- prose

/** A few paragraphs: a plan summary, a motivation, a caveat. One node. */
export interface ProseBlock extends BlockBase {
  type: 'prose'
  text: string
}

// ---------------------------------------------------------------- annotated-text

/**
 * Where a step lives in the text: a W3C Web Annotation selector. A quote
 * selector names the exact text, with `prefix` and `suffix` (the text just
 * before and after) when the quote appears more than once. A position
 * selector gives character offsets, end exclusive.
 */
export interface TextQuoteSelector {
  type: 'TextQuoteSelector'
  exact: string
  prefix?: string
  suffix?: string
}

export interface TextPositionSelector {
  type: 'TextPositionSelector'
  start: number
  end: number
}

export type Anchor = TextQuoteSelector | TextPositionSelector

export interface Ref {
  table: string
  column: string
}

export interface Step extends Node {
  title: string
  anchor: Anchor
  /** One line for the step list. */
  summary: string
  /** Paragraphs for the walkthrough. */
  detail: string
  touches?: (Ref | string)[]
  cost?: { rows?: number; note?: string }
  warnings?: string[]
}

/**
 * Any text with numbered steps anchored into it: a SQL query, a function, a
 * config file. Steps may nest; the walkthrough lists them in the order given.
 */
export interface AnnotatedTextBlock extends BlockBase {
  type: 'annotated-text'
  /** Drives keyword tinting; `sql` is the only one tinted today. */
  language?: string
  text: string
  steps: Step[]
}

// ---------------------------------------------------------------- schema

export interface Column extends Node {
  name: string
  type: string
  nullable?: boolean
  default?: string
  pk?: boolean
  references?: Ref
  flags?: ('unique' | 'indexed' | 'generated')[]
  purpose?: string
}

export interface Index extends Node {
  name: string
  columns: string[]
  unique?: boolean
  where?: string
  purpose?: string
}

export interface Table extends Node {
  name: string
  schema?: string
  purpose: string
  columns: Column[]
  primaryKey?: string[]
  indexes?: Index[]
  rows?: number
  notes?: string[]
}

export interface Relation extends Node {
  from: Ref
  to: Ref
  cardinality: '1-1' | '1-n' | 'n-n'
  note?: string
}

export interface TableGroup extends Node {
  title: string
  tables: string[]
}

/** Tables, their columns, keys and indexes, grouped by domain. One section per table. */
export interface SchemaBlock extends BlockBase {
  type: 'schema'
  dialect?: string
  tables: Table[]
  /** Omit to derive from column `references`. */
  relations?: Relation[]
  groups?: TableGroup[]
}

// ---------------------------------------------------------------- operations

export interface Operation extends Node {
  /** A short category, e.g. add-column, backfill, drop-table, deploy. */
  kind: string
  /** What it acts on, e.g. a table and column. */
  target?: string
  title: string
  /** The statement or command. */
  code?: string
  before?: string
  after?: string
  detail: string
  risk: 'low' | 'medium' | 'high'
  locks?: string
  reversible: boolean
  rollback?: string
  warnings?: string[]
}

export interface Phase extends Node {
  title: string
  detail?: string
  ops: string[]
}

/** Ordered operations with risk, locks and rollback, optionally grouped into phases. */
export interface OperationsBlock extends BlockBase {
  type: 'operations'
  language?: string
  operations: Operation[]
  phases?: Phase[]
}

export type Block = ProseBlock | AnnotatedTextBlock | SchemaBlock | OperationsBlock
