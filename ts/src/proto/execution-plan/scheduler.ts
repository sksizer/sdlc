/**
 * runPlan — the dependency-primary scheduler.
 *
 * Algorithm (high level):
 *   1. Index incoming dep edges (`data` + `after`) per target. A node is
 *      *ready* when every dep source has reached terminal success.
 *   2. Loop: pick ready nodes whose `when` predicate is true; run them
 *      (in parallel). After each finishes, re-evaluate readiness.
 *   3. On failure, consult the node's `on-failure` edges:
 *        - run the recovery node;
 *        - if `retryMax` is set, re-run the source up to N times;
 *        - on success → terminal success.
 *        - on exhausted retries / no retry / recovery failure → terminal
 *          failure for the source node.
 *   4. Pipes: a `data` edge with `pipe` injects a fresh slot id pair
 *      (source.outputId override + target.inputMapping override) for that
 *      traversal. PhaseState is the only data substrate.
 *
 * NOT yet supported (intentional, prototype): branch nodes, parallel
 * regions, child workflows, while-loops, sub-state-machines (the inner
 * shape is opaque to this scheduler — tasks just *do* it themselves).
 */

import type { PhaseState } from "./phase-state.js";
import { PhaseState as PhaseStateImpl } from "./phase-state.js";
import type { InputResolver, TaskEnv, TaskOutput } from "./task.js";
import type {
  ExecutionEdge,
  ExecutionNode,
  ExecutionPlan,
  InputMapping,
  NodeId,
  NodeOutcome,
  RunResult,
  RunStep,
} from "./types.js";

interface RunContext {
  readonly plan: ExecutionPlan;
  readonly env: TaskEnv;
  readonly state: PhaseState;
  readonly steps: RunStep[];
  /** Terminal outcome per node (only set once). */
  readonly outcomes: Map<NodeId, NodeOutcome>;
  /** Source node id this edge originated from, for pipe id derivation. */
  readonly edgesIn: Map<NodeId, ExecutionEdge[]>;
  readonly edgesOut: Map<NodeId, ExecutionEdge[]>;
}

function indexEdges(plan: ExecutionPlan): {
  edgesIn: Map<NodeId, ExecutionEdge[]>;
  edgesOut: Map<NodeId, ExecutionEdge[]>;
} {
  const edgesIn = new Map<NodeId, ExecutionEdge[]>();
  const edgesOut = new Map<NodeId, ExecutionEdge[]>();
  for (const id of plan.nodes.keys()) {
    edgesIn.set(id, []);
    edgesOut.set(id, []);
  }
  for (const e of plan.edges) {
    edgesIn.get(e.to)?.push(e);
    edgesOut.get(e.from)?.push(e);
  }
  return { edgesIn, edgesOut };
}

/** Stable id for a pipe slot — based on source/target node ids and rename tag. */
function pipeSlotId(edge: ExecutionEdge, asName: string | undefined): string {
  const tag = asName !== undefined && asName !== "" ? `:${asName}` : "";
  return `__pipe:${edge.from}->${edge.to}${tag}`;
}

/**
 * Compute the effective inputMapping for a node, merging any pipe-edge
 * overrides from satisfied incoming `data` edges into the node's own
 * declared mapping. Pipe overrides take precedence — explicit data flow
 * over implicit slot lookup.
 */
function effectiveInputMapping(
  node: ExecutionNode,
  ctx: RunContext
): InputMapping | undefined {
  const incoming = ctx.edgesIn.get(node.id) ?? [];
  const pipeOverrides: InputMapping = {};
  let any = false;
  for (const e of incoming) {
    if (e.via.kind !== "data" || e.via.pipe === undefined) continue;
    const sourceNode = ctx.plan.nodes.get(e.from);
    if (sourceNode === undefined || sourceNode.task.writes === undefined) {
      continue;
    }
    const key = e.via.pipe.as ?? sourceNode.task.writes.name;
    pipeOverrides[key] = pipeSlotId(e, e.via.pipe.as);
    any = true;
  }
  if (!any) return node.inputMapping;
  return { ...(node.inputMapping ?? {}), ...pipeOverrides };
}

/** Effective outputId — pipe overrides take precedence over node's own. */
function effectiveOutputId(
  node: ExecutionNode,
  ctx: RunContext
): string | undefined {
  // If any outgoing data edge has a pipe, write to the pipe slot for
  // that edge instead of the default outputId. (For multi-pipe-out, we
  // write to all pipe slots; see notes below.)
  const outgoing = ctx.edgesOut.get(node.id) ?? [];
  const pipeEdges = outgoing.filter(
    (e) => e.via.kind === "data" && e.via.pipe !== undefined
  );
  if (pipeEdges.length === 0) return node.outputId;
  // Prototype simplification: if there's exactly one outgoing pipe edge,
  // route the write to that slot. Multi-pipe-out is rare in CI flows;
  // we'd handle it by writing to the default slot AND to each pipe slot.
  const first = pipeEdges[0];
  if (first === undefined) return node.outputId;
  if (first.via.kind !== "data" || first.via.pipe === undefined) {
    return node.outputId;
  }
  return pipeSlotId(first, first.via.pipe.as);
}

function makeResolver(
  state: PhaseState,
  inputMapping: InputMapping | undefined
): InputResolver {
  return (cls, id) => {
    if (id !== undefined) {
      // Caller explicit id — bypass mapping.
      return state.get(cls, id);
    }
    const mapped = inputMapping?.[cls.name];
    if (mapped !== undefined) {
      const resolved = typeof mapped === "function" ? mapped(state) : mapped;
      return state.get(cls, resolved);
    }
    return state.get(cls);
  };
}

async function executeNode(
  node: ExecutionNode,
  ctx: RunContext
): Promise<TaskOutput> {
  const inputMapping = effectiveInputMapping(node, ctx);
  const resolve = makeResolver(ctx.state, inputMapping);
  return await node.task.run(ctx.env, resolve);
}

function persistOutput(
  node: ExecutionNode,
  output: TaskOutput,
  ctx: RunContext
): void {
  if (output.value === undefined || node.task.writes === undefined) return;
  const slot = effectiveOutputId(node, ctx);
  ctx.state.put(output.value as object, slot);

  // If the node also has a non-pipe outputId or default consumer, we
  // additionally write to the node's own declared outputId/default slot
  // so consumers via inputMapping/`resolve(cls)` can see it.
  if (slot !== node.outputId && node.outputId !== undefined) {
    ctx.state.put(output.value as object, node.outputId);
  }
}

/**
 * Run a node and resolve its terminal outcome, including the on-failure
 * recovery loop. This is where the "node is a unit of completion"
 * principle is enforced — by the time we return, the node has either
 * succeeded or failed terminally.
 */
async function runNodeToTerminal(
  node: ExecutionNode,
  ctx: RunContext
): Promise<NodeOutcome> {
  // Filter: skip if `when` is false.
  if (node.when !== undefined && !node.when(ctx.state)) {
    const outcome: NodeOutcome = { kind: "skipped" };
    ctx.steps.push({ nodeId: node.id, outcome });
    return outcome;
  }

  let attempt = 0;
  let output: TaskOutput;
  try {
    output = await executeNode(node, ctx);
  } catch (e) {
    const reason = `Task "${node.task.name}" threw: ${e instanceof Error ? e.message : String(e)}`;
    ctx.steps.push({
      nodeId: node.id,
      attempt,
      outcome: { kind: "failed", reason },
    });
    return { kind: "failed", reason };
  }

  if (output.success) {
    persistOutput(node, output, ctx);
    ctx.steps.push({
      nodeId: node.id,
      attempt,
      outcome: { kind: "succeeded", value: output.value },
    });
    return { kind: "succeeded", value: output.value };
  }

  // First attempt failed — record and try recovery via on-failure edges.
  persistOutput(node, output, ctx); // even on failure, recovery may need it
  ctx.steps.push({
    nodeId: node.id,
    attempt,
    outcome: {
      kind: "failed",
      reason: output.failureReason ?? "unknown failure",
    },
  });

  const onFailureEdges = (ctx.edgesOut.get(node.id) ?? []).filter(
    (e) => e.via.kind === "on-failure"
  );
  if (onFailureEdges.length === 0) {
    return {
      kind: "failed",
      reason: output.failureReason ?? "unknown failure",
    };
  }

  // For prototype: take the first on-failure edge.
  const fEdge = onFailureEdges[0];
  if (fEdge === undefined || fEdge.via.kind !== "on-failure") {
    return {
      kind: "failed",
      reason: output.failureReason ?? "unknown failure",
    };
  }
  const retryMax = fEdge.via.retryMax ?? 0;

  for (let i = 1; i <= Math.max(retryMax, 0); i++) {
    // Run recovery first
    const recoveryNode = ctx.plan.nodes.get(fEdge.to);
    if (recoveryNode === undefined) {
      return {
        kind: "failed",
        reason: `recovery node "${fEdge.to}" not found`,
      };
    }
    let recoveryOut: TaskOutput;
    try {
      recoveryOut = await executeNode(recoveryNode, ctx);
    } catch (e) {
      const reason = `Recovery "${recoveryNode.task.name}" threw: ${e instanceof Error ? e.message : String(e)}`;
      ctx.steps.push({
        nodeId: recoveryNode.id,
        recoveryFor: node.id,
        attempt: i,
        outcome: { kind: "failed", reason },
      });
      return { kind: "failed", reason };
    }
    persistOutput(recoveryNode, recoveryOut, ctx);
    ctx.steps.push({
      nodeId: recoveryNode.id,
      recoveryFor: node.id,
      attempt: i,
      outcome: recoveryOut.success
        ? { kind: "succeeded", value: recoveryOut.value }
        : { kind: "failed", reason: recoveryOut.failureReason ?? "unknown" },
    });
    if (!recoveryOut.success) {
      return {
        kind: "failed",
        reason: `Recovery "${recoveryNode.task.name}" failed: ${recoveryOut.failureReason ?? "unknown"}`,
      };
    }

    // Retry the source node
    attempt = i;
    try {
      output = await executeNode(node, ctx);
    } catch (e) {
      const reason = `Task "${node.task.name}" threw on retry: ${e instanceof Error ? e.message : String(e)}`;
      ctx.steps.push({
        nodeId: node.id,
        attempt,
        outcome: { kind: "failed", reason },
      });
      return { kind: "failed", reason };
    }
    persistOutput(node, output, ctx);
    ctx.steps.push({
      nodeId: node.id,
      attempt,
      outcome: output.success
        ? { kind: "succeeded", value: output.value }
        : {
            kind: "failed",
            reason: output.failureReason ?? "unknown failure",
          },
    });
    if (output.success) {
      return { kind: "succeeded", value: output.value };
    }
  }

  // Retries exhausted (or retryMax was 0 — compensate-only).
  if (retryMax === 0) {
    // Run recovery once for compensate (no retry).
    const recoveryNode = ctx.plan.nodes.get(fEdge.to);
    if (recoveryNode !== undefined) {
      let recoveryOut: TaskOutput;
      try {
        recoveryOut = await executeNode(recoveryNode, ctx);
        persistOutput(recoveryNode, recoveryOut, ctx);
        ctx.steps.push({
          nodeId: recoveryNode.id,
          recoveryFor: node.id,
          outcome: recoveryOut.success
            ? { kind: "succeeded", value: recoveryOut.value }
            : {
                kind: "failed",
                reason: recoveryOut.failureReason ?? "unknown",
              },
        });
      } catch (e) {
        const reason = `Compensation "${recoveryNode.task.name}" threw: ${e instanceof Error ? e.message : String(e)}`;
        ctx.steps.push({
          nodeId: recoveryNode.id,
          recoveryFor: node.id,
          outcome: { kind: "failed", reason },
        });
      }
    }
  }

  return {
    kind: "failed",
    reason: output.failureReason ?? "unknown failure",
  };
}

/**
 * A node is "recovery-only" if every incoming edge is `on-failure`. Such
 * nodes are run by the on-failure code path of their parent — never by
 * the main scheduling loop — so they're invisible to dep-readiness.
 */
function isRecoveryOnly(nodeId: NodeId, ctx: RunContext): boolean {
  const incoming = ctx.edgesIn.get(nodeId) ?? [];
  if (incoming.length === 0) return false;
  return incoming.every((e) => e.via.kind === "on-failure");
}

function isReady(nodeId: NodeId, ctx: RunContext): boolean {
  if (ctx.outcomes.has(nodeId)) return false;
  if (isRecoveryOnly(nodeId, ctx)) return false;
  const incoming = ctx.edgesIn.get(nodeId) ?? [];
  for (const e of incoming) {
    if (e.via.kind !== "data" && e.via.kind !== "after") continue;
    const srcOutcome = ctx.outcomes.get(e.from);
    if (srcOutcome === undefined) return false;
    // Skipped sources block dependents — pessimistic but predictable.
    if (srcOutcome.kind !== "succeeded") return false;
  }
  return true;
}

export async function runPlan(
  plan: ExecutionPlan,
  env: TaskEnv = { dryRun: false }
): Promise<RunResult> {
  const state = new PhaseStateImpl();
  for (const seed of plan.seeds) state.put(seed);

  const { edgesIn, edgesOut } = indexEdges(plan);
  const ctx: RunContext = {
    plan,
    env,
    state,
    steps: [],
    outcomes: new Map(),
    edgesIn,
    edgesOut,
  };

  // Schedule loop. Run all currently-ready nodes in parallel, then
  // re-evaluate. Stops when nothing more can run.
  // For determinism in tests, sort ready nodes by id.
  // Failure of any node is recorded but doesn't stop other independent
  // branches; dependents of a failed node simply stay un-ready forever.
  // The final RunResult.success reflects: did every node reach terminal
  // success OR was it correctly skipped (i.e. not failed).
  for (;;) {
    const ready: ExecutionNode[] = [];
    for (const id of plan.nodes.keys()) {
      if (isReady(id, ctx)) {
        const n = plan.nodes.get(id);
        if (n !== undefined) ready.push(n);
      }
    }
    if (ready.length === 0) break;
    ready.sort((a, b) => a.id.localeCompare(b.id));

    const results = await Promise.all(
      ready.map((n) => runNodeToTerminal(n, ctx))
    );
    for (let i = 0; i < ready.length; i++) {
      const node = ready[i];
      const outcome = results[i];
      if (node !== undefined && outcome !== undefined) {
        ctx.outcomes.set(node.id, outcome);
      }
    }
  }

  let firstFailure: { id: NodeId; reason: string } | undefined;
  for (const [id, outcome] of ctx.outcomes) {
    if (outcome.kind === "failed") {
      firstFailure = { id, reason: outcome.reason };
      break;
    }
  }
  // Any non-recovery-only node that never ran (no terminal outcome) is
  // an "unreachable / unsatisfied" failure. Recovery-only nodes are
  // exempt — if their parent never failed, they were never needed.
  let unrun = 0;
  for (const id of plan.nodes.keys()) {
    if (ctx.outcomes.has(id)) continue;
    if (isRecoveryOnly(id, ctx)) continue;
    unrun++;
  }

  if (firstFailure !== undefined) {
    return {
      success: false,
      failureReason: `Node "${firstFailure.id}" failed: ${firstFailure.reason}`,
      steps: ctx.steps,
      state,
    };
  }
  if (unrun > 0) {
    return {
      success: false,
      failureReason: `${String(unrun)} node(s) unreachable or unsatisfied`,
      steps: ctx.steps,
      state,
    };
  }
  return { success: true, steps: ctx.steps, state };
}
