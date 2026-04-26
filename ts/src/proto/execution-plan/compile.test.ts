/**
 * compile.test.ts — what does a real workflow look like in ExecutionPlan?
 *
 * Reconstructs a dev-session-shaped sequential workflow (the shape used in
 * `ts/src/data/workflows/dev-session/workflow.ts`), runs it through the
 * compiler, and:
 *   1. Asserts the resulting ExecutionPlan has the expected topology.
 *   2. Pretty-prints the plan as a comment-style trace so a reader can
 *      see the mapping at a glance.
 *   3. Executes the compiled plan via runPlan and verifies behavior
 *      matches the legacy runner: linear order, recovery loop, downstream
 *      dependents wait for the parent's terminal state.
 */

import { describe, expect, it } from "bun:test";
import type { LegacyWorkflow, LegacyWrappedTask } from "./compile.js";
import { compileWorkflow } from "./compile.js";
import type { PayloadClass } from "./phase-state.js";
import { runPlan } from "./scheduler.js";
import type { InputResolver, Task, TaskOutput } from "./task.js";

// ---------- Test payloads (same shape as production CodeEnv etc.) ----------

class CodeEnv {
  readonly cwd: string;
  constructor(cwd: string) {
    this.cwd = cwd;
  }
}
class WorktreeState {
  readonly branch: string;
  constructor(branch: string) {
    this.branch = branch;
  }
}
class QualityResult {
  readonly ok: boolean;
  readonly reason: string;
  constructor(ok: boolean, reason: string) {
    this.ok = ok;
    this.reason = reason;
  }
}
class AgentResult {
  readonly summary: string;
  constructor(summary: string) {
    this.summary = summary;
  }
}
class PrResult {
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
}

// ---------- Test task helper ----------

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

// ---------- Build a dev-session-shaped legacy workflow ----------

/**
 * Mirrors ts/src/data/workflows/dev-session/workflow.ts:
 *
 *   .seed(CodeEnv).seed(WorktreeState)
 *   .add(interactiveClaudeTask(...))
 *   .add(codeQualityTask(), {
 *     onFailure: { task: agentTask({ name: "fix-quality" }), retry: 3 },
 *   })
 *   .add(diffCheckTask())
 *   .add(commitTask(...))
 *   .add(pushBranch())
 *   .add(createPr())
 *
 * Tasks here are stubs that exercise the shape; the production tasks do
 * real work (spawn Claude, run shell, gh pr create) but the orchestration
 * is identical.
 */
function buildDevSessionLegacy(qualityFailsFirst: boolean): LegacyWorkflow {
  let qualityCalls = 0;

  const interactive: Task = task(
    "interactive-claude",
    [CodeEnv],
    undefined,
    () => ({
      success: true,
    })
  );

  const quality: Task = task("code-quality", [CodeEnv], QualityResult, () => {
    qualityCalls++;
    if (qualityFailsFirst && qualityCalls === 1) {
      return {
        success: false,
        failureReason: "lint failed",
        value: new QualityResult(false, "lint failed"),
      };
    }
    return { success: true, value: new QualityResult(true, "all checks pass") };
  });

  const fixQuality: Task = task(
    "fix-quality",
    [QualityResult],
    AgentResult,
    (resolve) => {
      // In production this would spawn a Claude agent that edits files
      // until quality passes. Here we just mark it fixed.
      const qr = resolve(QualityResult);
      return {
        success: true,
        value: new AgentResult(`fixed: ${qr.reason}`),
      };
    }
  );

  const diffCheck: Task = task("diff-check", [], undefined, () => ({
    success: true,
  }));
  const commit: Task = task("commit", [WorktreeState], undefined, () => ({
    success: true,
  }));
  const pushBranch: Task = task(
    "push-branch",
    [WorktreeState],
    undefined,
    () => ({
      success: true,
    })
  );
  const createPr: Task = task("create-pr", [WorktreeState], PrResult, () => ({
    success: true,
    value: new PrResult("https://github.com/example/pr/123"),
  }));

  const tasks: LegacyWrappedTask[] = [
    { task: interactive },
    {
      task: quality,
      onFailure: { task: fixQuality, retry: 3 },
    },
    { task: diffCheck },
    { task: commit },
    { task: pushBranch },
    { task: createPr },
  ];

  return {
    name: "dev-session",
    description: "Interactive Claude session with quality checks and PR",
    seeds: [new CodeEnv("/repo"), new WorktreeState("feature/x")],
    tasks,
  };
}

// ---------- Tour: what does the compiled plan look like? ----------

describe("compileWorkflow — dev-session shape", () => {
  it("compiles to the expected ExecutionPlan topology", () => {
    const wf = buildDevSessionLegacy(false);
    const plan = compileWorkflow(wf);

    // Seven nodes total: six task nodes + one recovery for code-quality.
    expect([...plan.nodes.keys()]).toEqual([
      "interactive-claude",
      "code-quality",
      "code-quality__recovery",
      "diff-check",
      "commit",
      "push-branch",
      "create-pr",
    ]);

    // Edges: 5 sequential `after` edges + 1 `on-failure` edge for the
    // recovery. NO edge from code-quality__recovery back to anything in
    // the main chain — the recovery is internal to code-quality.
    const summarized = plan.edges.map(
      (e) => `${e.from}-[${e.via.kind}]->${e.to}`
    );
    // Edge order reflects the mapper's traversal: for each task i, emit
    // the `after` edge from i-1 (if any), then any `on-failure` edge for
    // task i. So the recovery edge appears immediately after its parent.
    expect(summarized).toEqual([
      "interactive-claude-[after]->code-quality",
      "code-quality-[on-failure]->code-quality__recovery",
      "code-quality-[after]->diff-check",
      "diff-check-[after]->commit",
      "commit-[after]->push-branch",
      "push-branch-[after]->create-pr",
    ]);

    // The on-failure edge carries the retry budget.
    const fEdge = plan.edges.find((e) => e.via.kind === "on-failure");
    expect(fEdge?.via).toEqual({ kind: "on-failure", retryMax: 3 });
  });

  it("runs end-to-end with quality passing on first try", async () => {
    const wf = buildDevSessionLegacy(false);
    const plan = compileWorkflow(wf);
    const result = await runPlan(plan);

    expect(result.success).toBe(true);
    // Steps should be the six tasks in order, no recovery invocations.
    expect(result.steps.map((s) => s.nodeId)).toEqual([
      "interactive-claude",
      "code-quality",
      "diff-check",
      "commit",
      "push-branch",
      "create-pr",
    ]);
  });

  it("runs end-to-end with quality failing once, recovery + retry", async () => {
    const wf = buildDevSessionLegacy(true);
    const plan = compileWorkflow(wf);
    const result = await runPlan(plan);

    expect(result.success).toBe(true);
    // Trace:
    //   interactive-claude(ok), code-quality(fail), recovery(ok),
    //   code-quality(ok), diff-check(ok), commit(ok), push-branch(ok),
    //   create-pr(ok)
    expect(result.steps.map((s) => `${s.nodeId}:${s.outcome.kind}`)).toEqual([
      "interactive-claude:succeeded",
      "code-quality:failed",
      "code-quality__recovery:succeeded",
      "code-quality:succeeded",
      "diff-check:succeeded",
      "commit:succeeded",
      "push-branch:succeeded",
      "create-pr:succeeded",
    ]);

    // Recovery's AgentResult is observable in state (via the #7-class fix
    // baked into the prototype scheduler).
    expect(result.state.has(AgentResult)).toBe(true);
    expect(result.state.get(AgentResult).summary).toBe("fixed: lint failed");

    // create-pr's PrResult is in state.
    expect(result.state.get(PrResult).url).toContain("github.com");
  });

  it("dependents wait for code-quality's terminal state, not retry attempts", async () => {
    const wf = buildDevSessionLegacy(true);
    const plan = compileWorkflow(wf);
    const result = await runPlan(plan);

    // diff-check (the next sequential dep on code-quality) appears AFTER
    // code-quality reaches terminal-success — i.e. after recovery + retry.
    const ids = result.steps.map((s) => s.nodeId);
    const lastQuality = ids.lastIndexOf("code-quality");
    const firstDiff = ids.indexOf("diff-check");
    expect(firstDiff).toBeGreaterThan(lastQuality);
    // diff-check appears exactly once — it doesn't run for each retry.
    expect(ids.filter((i) => i === "diff-check")).toHaveLength(1);
  });
});

// ---------- Pretty-print helper for human readability ----------

describe("plan rendering (informational, not a real test)", () => {
  it("dumps a summary that's readable in the test output", () => {
    const wf = buildDevSessionLegacy(true);
    const plan = compileWorkflow(wf);

    // Build a pretty-printed view of the compiled plan. Useful for
    // "what does this look like?" inspection — eyeball it from the bun
    // test output if you run with --verbose.
    const lines: string[] = [];
    lines.push(`# ExecutionPlan: ${plan.id}`);
    lines.push(`#   ${plan.description}`);
    lines.push(
      `# seeds: ${plan.seeds.map((s) => s.constructor.name).join(", ")}`
    );
    lines.push(`# nodes (${String(plan.nodes.size)}):`);
    for (const [id, n] of plan.nodes) {
      const w =
        n.task.writes !== undefined ? ` writes=${n.task.writes.name}` : "";
      const r =
        n.task.reads.length > 0
          ? ` reads=[${n.task.reads.map((c) => c.name).join(",")}]`
          : "";
      lines.push(`#   ${id}${r}${w}`);
    }
    lines.push(`# edges (${String(plan.edges.length)}):`);
    for (const e of plan.edges) {
      const tag =
        e.via.kind === "on-failure"
          ? `on-failure retry=${String(e.via.retryMax ?? 0)}`
          : e.via.kind;
      lines.push(`#   ${e.from} --[${tag}]--> ${e.to}`);
    }
    // Print to stdout for visibility in test output.
    console.log(`\n${lines.join("\n")}\n`);

    // No assertions — the value is in the output.
    expect(plan.nodes.size).toBeGreaterThan(0);
  });
});
