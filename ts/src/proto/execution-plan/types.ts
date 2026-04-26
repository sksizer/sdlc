/**
 * ExecutionPlan — canonical, dependency-primary graph model for workflows.
 *
 * Design summary (reflects discussion 2026-04-25):
 *
 * - Nodes are units of completion. What happens *inside* a node (one try,
 *   retry loop, sub-state-machine) is opaque to the graph.
 *
 * - Two edge classes:
 *     • Dependency edges — `data` (with optional pipe), `after` (ordering only).
 *       Target waits for source's terminal success.
 *     • Internal control edges — `on-failure` with optional retryMax.
 *       Do NOT propagate dependency. Dependents see only the source's
 *       terminal state.
 *
 * - Pipes are syntactic sugar over PhaseState id rewrites. There is one
 *   data substrate; pipe edges auto-generate a slot id and inject a
 *   matching inputMapping for the duration of that traversal.
 *
 * - Filter (`when`) is a node attribute, not an edge attribute. Skipping
 *   is the node's own readiness check, not a fact about any single dep.
 *
 * - Fork/branch as a dedicated node kind is deferred (YAGNI for v1).
 */

import type { PhaseState } from "./phase-state.js";
import type { Task } from "./task.js";

/** Unique identifier for a node within a plan. */
export type NodeId = string;

/** Predicate over the live shared state. Used by `when` filters. */
export type Predicate = (state: PhaseState) => boolean;

/**
 * Maps a payload class name to either a literal id or a function that
 * derives one from current state.
 */
export type InputMapping = Record<string, string | ((s: PhaseState) => string)>;

/** Pipe annotation on a `data` edge — auto-wires source.writes to target. */
export interface PipeSpec {
  /** Optional rename — useful if target reads the same payload class
   *  from multiple upstream sources via different inputMapping keys. */
  readonly as?: string;
}

/**
 * Edge kinds. Two classes:
 *   - `data` and `after` are *dependency* edges (drive scheduling).
 *   - `on-failure` is an *internal control* edge (does not propagate dep).
 */
export type EdgeKind =
  | { readonly kind: "data"; readonly pipe?: PipeSpec }
  | { readonly kind: "after" }
  | { readonly kind: "on-failure"; readonly retryMax?: number };

export interface ExecutionEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly via: EdgeKind;
}

export interface ExecutionNode {
  readonly id: NodeId;
  readonly task: Task;
  /** Optional gate. If predicate returns false, node is skipped. */
  readonly when?: Predicate | undefined;
  /** Same semantics as engine/types.ts InputMapping. */
  readonly inputMapping?: InputMapping | undefined;
  /** Slot id under which this node's task.writes lands in PhaseState. */
  readonly outputId?: string | undefined;
}

export interface ExecutionPlan {
  readonly id: string;
  readonly description: string;
  readonly seeds: readonly object[];
  readonly nodes: ReadonlyMap<NodeId, ExecutionNode>;
  readonly edges: readonly ExecutionEdge[];
}

/** Scheduler-visible terminal state for a node. */
export type NodeOutcome =
  | { readonly kind: "succeeded"; readonly value?: unknown }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "skipped" };

export interface RunStep {
  readonly nodeId: NodeId;
  readonly outcome: NodeOutcome;
  /** When this node is a recovery, the parent it ran for. */
  readonly recoveryFor?: NodeId;
  /** Retry attempt index (0 = first try, 1 = first retry, ...). */
  readonly attempt?: number;
}

export interface RunResult {
  readonly success: boolean;
  readonly failureReason?: string;
  readonly steps: readonly RunStep[];
  /** Final state — for tests and post-mortem inspection. */
  readonly state: PhaseState;
}
