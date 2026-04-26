/**
 * Task — the unit of work executed at a node.
 *
 * Self-contained for the prototype. The framework is agnostic to what
 * happens inside `run`: a single call, a retry loop, an XState actor,
 * a sub-workflow — all are valid. The graph sees only TaskOutput.
 */

import type { PayloadClass, PhaseState } from "./phase-state.js";

/** Resolver passed to a task at run time. Reads from PhaseState. */
export type InputResolver = <T>(cls: PayloadClass<T>, id?: string) => T;

export interface TaskEnv {
  readonly dryRun: boolean;
}

export interface TaskOutput<T = unknown> {
  readonly success: boolean;
  readonly failureReason?: string;
  readonly value?: T;
}

export interface Task<R extends string = string, W extends string = string> {
  readonly name: string;
  readonly reads: readonly PayloadClass[];
  readonly writes?: PayloadClass | undefined;
  run(env: TaskEnv, resolve: InputResolver): Promise<TaskOutput> | TaskOutput;
  // R, W are phantom-only for now; the prototype doesn't enforce Ctx
  // membership at the type level. That's a separate concern (#8 follow-up).
  readonly _readsBrand?: R | undefined;
  readonly _writesBrand?: W | undefined;
}
