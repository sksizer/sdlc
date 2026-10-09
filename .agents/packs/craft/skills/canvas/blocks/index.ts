/** The block registry: type to renderer and checker. Add a block type here. */
import type { BlockOut } from '../lib/doc.ts'
import * as annotatedText from './annotated-text.ts'
import * as matrix from './matrix.ts'
import * as operations from './operations.ts'
import * as plan from './plan.ts'
import * as precedence from './precedence.ts'
import * as prose from './prose.ts'
import * as schema from './schema.ts'
import * as trace from './trace.ts'
import type { Block } from './types.ts'

export interface BlockModule<B extends Block = Block> {
  render(b: B): BlockOut
  check(b: B): string[]
  /** Node ids the block owns beyond its sections (for uniqueness and `about` checks). */
  nodeIds?(b: B): string[]
}

export const BLOCKS: Record<Block['type'], BlockModule<any>> = {
  prose,
  'annotated-text': annotatedText,
  schema,
  operations,
  matrix,
  trace,
  precedence,
  plan,
}

export function blockModule(type: string): BlockModule | undefined {
  return (BLOCKS as Record<string, BlockModule>)[type]
}
