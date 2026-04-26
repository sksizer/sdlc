/**
 * ExecutionPlan prototype — showcase tests.
 *
 * Each test demonstrates one design idea from the discussion. Tests are
 * organized in increasing complexity and meant to be read top-to-bottom
 * as a tour of the model.
 *
 * The plans are constructed by hand here to make the model's primitives
 * visible. A builder DSL on top is a v1 follow-up — the canonical model
 * is what these tests exercise.
 */

import { describe, expect, it } from "bun:test";
import type { PayloadClass } from "./phase-state.js";
import { runPlan } from "./scheduler.js";
import type { InputResolver, Task, TaskOutput } from "./task.js";
import type { ExecutionEdge, ExecutionNode, ExecutionPlan } from "./types.js";

// ---------- Test payloads ----------

class Greeting {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

class Loud {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

class Counter {
  readonly count: number;
  constructor(count: number) {
    this.count = count;
  }
}

// ---------- Helpers to keep tests focused on shape, not boilerplate ----------

function plan(parts: {
  id?: string;
  description?: string;
  seeds?: object[];
  nodes: ExecutionNode[];
  edges?: ExecutionEdge[];
}): ExecutionPlan {
  const nodes = new Map(parts.nodes.map((n) => [n.id, n]));
  return {
    id: parts.id ?? "test",
    description: parts.description ?? "",
    seeds: parts.seeds ?? [],
    nodes,
    edges: parts.edges ?? [],
  };
}

function task(
  name: string,
  reads: readonly PayloadClass[],
  writes: PayloadClass | undefined,
  fn: (resolve: InputResolver) => TaskOutput
): Task {
  return {
    name,
    reads,
    writes,
    run(_env, resolve) {
      return fn(resolve);
    },
  };
}

// ---------- Tests ----------

describe("linear A → B → C with data deps", () => {
  // The simplest case. A produces a Greeting, B reads it and produces
  // Loud, C reads Loud. All edges are `data` (which means: order + value
  // transfer via PhaseState's default slot).
  it("runs in order and each step sees the previous output", async () => {
    const A = task("A", [], Greeting, () => ({
      success: true,
      value: new Greeting("hello"),
    }));
    const B = task("B", [Greeting], Loud, (resolve) => {
      const g = resolve(Greeting);
      return { success: true, value: new Loud(g.text.toUpperCase()) };
    });
    const C = task("C", [Loud], undefined, (resolve) => {
      const l = resolve(Loud);
      return { success: l.text === "HELLO" };
    });

    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A },
          { id: "b", task: B },
          { id: "c", task: C },
        ],
        edges: [
          { from: "a", to: "b", via: { kind: "data" } },
          { from: "b", to: "c", via: { kind: "data" } },
        ],
      })
    );

    expect(result.success).toBe(true);
    expect(result.steps.map((s) => s.nodeId)).toEqual(["a", "b", "c"]);
  });
});

describe("parallel deps — A, B → C runs A and B concurrently", () => {
  // Dep-primary: C waits for *both* A and B. A and B have no edge
  // between them, so the scheduler runs them in parallel. C is C only
  // when both predecessors have terminal-succeeded.
  it("starts A and B together and waits both before C", async () => {
    const order: string[] = [];
    const A = task("A", [], Greeting, () => {
      order.push("a-start");
      return { success: true, value: new Greeting("a") };
    });
    const B = task("B", [], Counter, () => {
      order.push("b-start");
      return { success: true, value: new Counter(2) };
    });
    const C = task("C", [Greeting, Counter], undefined, (resolve) => {
      order.push("c-start");
      return {
        success: resolve(Greeting).text === "a" && resolve(Counter).count === 2,
      };
    });

    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A },
          { id: "b", task: B },
          { id: "c", task: C },
        ],
        edges: [
          { from: "a", to: "c", via: { kind: "data" } },
          { from: "b", to: "c", via: { kind: "data" } },
        ],
      })
    );

    expect(result.success).toBe(true);
    // a-start and b-start come before c-start; their relative order is
    // implementation-defined (we sort ready nodes by id for determinism).
    expect(order.indexOf("c-start")).toBeGreaterThan(
      Math.max(order.indexOf("a-start"), order.indexOf("b-start"))
    );
  });
});

describe("pipe vs context — two ways to thread A's output to B", () => {
  // Pipe: edge has `pipe: {}`. Source's writes auto-route to a per-edge
  // slot; target's resolver sees them via injected inputMapping.
  // Context: source uses an outputId; target declares inputMapping or
  // uses the default slot. Both share PhaseState as the substrate.

  it("pipe edge auto-wires source.writes to target", async () => {
    const A = task("A", [], Greeting, () => ({
      success: true,
      value: new Greeting("piped"),
    }));
    const B = task("B", [Greeting], undefined, (resolve) => ({
      success: resolve(Greeting).text === "piped",
    }));

    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A },
          { id: "b", task: B },
        ],
        edges: [{ from: "a", to: "b", via: { kind: "data", pipe: {} } }],
      })
    );

    expect(result.success).toBe(true);
  });

  it("named-slot context: A writes to 'first', B reads via inputMapping", async () => {
    const A = task("A", [], Greeting, () => ({
      success: true,
      value: new Greeting("named"),
    }));
    const B = task("B", [Greeting], undefined, (resolve) => ({
      success: resolve(Greeting).text === "named",
    }));

    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A, outputId: "first" },
          { id: "b", task: B, inputMapping: { Greeting: "first" } },
        ],
        edges: [{ from: "a", to: "b", via: { kind: "data" } }],
      })
    );

    expect(result.success).toBe(true);
  });
});

describe("`when` filter — node skipping", () => {
  // Filter is a node attribute. Node is skipped if predicate is false.
  // Skipped nodes do NOT satisfy downstream deps — dependents can't run.
  // (Conservative semantics; alternative: skipped propagates as "vacuously
  // satisfied". Worth a design decision before locking in.)

  it("when=false node is recorded as skipped", async () => {
    const A = task("A", [], undefined, () => ({ success: true }));
    const result = await runPlan(
      plan({
        nodes: [
          {
            id: "a",
            task: A,
            when: () => false,
          },
        ],
      })
    );

    // No active failures, but a was not run — count it as unsatisfied.
    expect(result.steps.find((s) => s.nodeId === "a")?.outcome.kind).toBe(
      "skipped"
    );
  });

  it("downstream of a skipped node does not run (current convention)", async () => {
    const A = task("A", [], Greeting, () => ({
      success: true,
      value: new Greeting("x"),
    }));
    const B = task("B", [Greeting], undefined, () => ({ success: true }));
    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A, when: () => false },
          { id: "b", task: B },
        ],
        edges: [{ from: "a", to: "b", via: { kind: "data" } }],
      })
    );

    // a was skipped; b never became ready. Workflow result reports
    // "1 node(s) unreachable or unsatisfied".
    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/unreachable|unsatisfied/);
  });
});

describe("on-failure with retryMax — recovery loop", () => {
  // Two policies on a single edge:
  //   retryMax: undefined → compensate-only (run R, propagate failure).
  //   retryMax: N         → run R, retry source, repeat up to N times.

  it("retries succeed within budget", async () => {
    let calls = 0;
    const flaky = task("flaky", [], undefined, () => {
      calls++;
      return calls < 3
        ? { success: false, failureReason: `fail #${String(calls)}` }
        : { success: true };
    });
    const fix = task("fix", [], undefined, () => ({ success: true }));

    const result = await runPlan(
      plan({
        nodes: [
          { id: "p", task: flaky },
          { id: "r", task: fix },
        ],
        edges: [
          { from: "p", to: "r", via: { kind: "on-failure", retryMax: 3 } },
        ],
      })
    );

    expect(result.success).toBe(true);
    expect(calls).toBe(3);
    // Trace: p(fail) → r(ok) → p(fail) → r(ok) → p(ok)
    expect(result.steps.map((s) => `${s.nodeId}:${s.outcome.kind}`)).toEqual([
      "p:failed",
      "r:succeeded",
      "p:failed",
      "r:succeeded",
      "p:succeeded",
    ]);
  });

  it("exhausts retries → terminal failure", async () => {
    const stubborn = task("stubborn", [], undefined, () => ({
      success: false,
      failureReason: "still broken",
    }));
    const fix = task("fix", [], undefined, () => ({ success: true }));

    const result = await runPlan(
      plan({
        nodes: [
          { id: "p", task: stubborn },
          { id: "r", task: fix },
        ],
        edges: [
          { from: "p", to: "r", via: { kind: "on-failure", retryMax: 2 } },
        ],
      })
    );

    expect(result.success).toBe(false);
    expect(result.failureReason).toMatch(/still broken/);
  });

  it("compensate-only (no retryMax) — R runs, source still fails", async () => {
    let cleanupRan = false;
    const failing = task("failing", [], undefined, () => ({
      success: false,
      failureReason: "expected",
    }));
    const cleanup = task("cleanup", [], undefined, () => {
      cleanupRan = true;
      return { success: true };
    });

    const result = await runPlan(
      plan({
        nodes: [
          { id: "p", task: failing },
          { id: "c", task: cleanup },
        ],
        edges: [{ from: "p", to: "c", via: { kind: "on-failure" } }],
      })
    );

    expect(result.success).toBe(false);
    expect(cleanupRan).toBe(true);
  });
});

describe("recovery node persists its own output (closes #7-class bug)", () => {
  // A recovery's writes must land in PhaseState — otherwise downstream
  // tasks can't observe what the recovery did. Mirrors the just-fixed
  // production runner behavior.

  it("downstream task can read recovery's Counter output", async () => {
    let parentCalls = 0;
    let downstreamSeen: number | undefined;

    const flakyParent = task("p", [], undefined, () => {
      parentCalls++;
      return parentCalls === 1
        ? { success: false, failureReason: "first try" }
        : { success: true };
    });
    const recoveryProducer = task("r", [], Counter, () => ({
      success: true,
      value: new Counter(42),
    }));
    const downstream = task("d", [Counter], undefined, (resolve) => {
      downstreamSeen = resolve(Counter).count;
      return { success: true };
    });

    const result = await runPlan(
      plan({
        nodes: [
          { id: "p", task: flakyParent },
          { id: "r", task: recoveryProducer },
          { id: "d", task: downstream },
        ],
        edges: [
          { from: "p", to: "r", via: { kind: "on-failure", retryMax: 1 } },
          { from: "p", to: "d", via: { kind: "data" } },
        ],
      })
    );

    expect(result.success).toBe(true);
    expect(downstreamSeen).toBe(42);
  });
});

describe("nodes are units of completion — recovery is internal", () => {
  // C depends on B. B has on-failure → R with retryMax. C has no edge
  // to R. Verifies: C waits for B's terminal state (after retry succeeds),
  // and C never sees R as a dep.

  it("C runs only after B terminally succeeds, regardless of retries", async () => {
    let bCalls = 0;
    const bRunHistory: string[] = [];

    const A = task("A", [], undefined, () => ({ success: true }));
    const B = task("B", [], Greeting, () => {
      bCalls++;
      bRunHistory.push(`b-${String(bCalls)}`);
      return bCalls < 2
        ? { success: false, failureReason: "first try" }
        : { success: true, value: new Greeting("ok") };
    });
    const R = task("R", [], undefined, () => ({ success: true }));
    const C = task("C", [Greeting], undefined, (resolve) => {
      bRunHistory.push(`c-saw-${resolve(Greeting).text}`);
      return { success: true };
    });

    const result = await runPlan(
      plan({
        nodes: [
          { id: "a", task: A },
          { id: "b", task: B },
          { id: "r", task: R },
          { id: "c", task: C },
        ],
        edges: [
          { from: "a", to: "b", via: { kind: "after" } },
          { from: "b", to: "r", via: { kind: "on-failure", retryMax: 2 } },
          { from: "b", to: "c", via: { kind: "data" } },
        ],
      })
    );

    expect(result.success).toBe(true);
    // C runs once, after the second (successful) B attempt.
    expect(bRunHistory).toEqual(["b-1", "b-2", "c-saw-ok"]);
  });
});

describe("seeds — initial payloads available before any node runs", () => {
  it("a node can read a seeded payload via the default slot", async () => {
    const T = task("T", [Greeting], undefined, (resolve) => ({
      success: resolve(Greeting).text === "seeded",
    }));
    const result = await runPlan(
      plan({
        seeds: [new Greeting("seeded")],
        nodes: [{ id: "t", task: T }],
      })
    );
    expect(result.success).toBe(true);
  });
});
