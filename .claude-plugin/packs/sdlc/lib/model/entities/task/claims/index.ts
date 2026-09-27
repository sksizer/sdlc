/**
 * Barrel for the claim-resolver package.
 *
 * `RESOLVERS` is the typed, explicit registry of every resolver the
 * /sdlc:task-ensure-ready gate runs. Registration is by hand — import the
 * module, add it to the array — so the registry is compile-checked (every
 * entry must satisfy `ClaimResolver`) and greppable. This matches the
 * explicit-barrel convention of the `solutions/ontological/lib/` packages; there is
 * deliberately NO dynamic filesystem scan, and `claims/` deliberately sits
 * OUTSIDE the op registry's discovery walk (which roots only the sibling
 * `ops/` directory per D-0007 §2a).
 *
 * Adding a resolver is two lines: one `import`, one array entry.
 */

import type { ClaimResolver, Finding, Severity } from './types.ts'
import { pathsResolver } from './paths.ts'
import { quantifiersResolver } from './quantifiers.ts'

/** The ordered registry of active claim resolvers. */
export const RESOLVERS: ClaimResolver[] = [pathsResolver, quantifiersResolver]

export type { ClaimResolver, Finding, Severity }
export { pathsResolver, quantifiersResolver }
