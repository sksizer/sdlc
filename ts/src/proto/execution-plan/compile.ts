/**
 * Compile a sequential `LegacyWorkflow` (today's WrappedTask[] shape)
 * into the canonical ExecutionPlan.
 *
 * Mapping rules:
 *   - Each WrappedTask → one ExecutionNode. Node id is the task name,
 *     suffixed with `#N` if the same name appears multiple times.
 *   - Consecutive tasks → `after` edges between them. Sequential
 *     workflows don't declare which data they carry on each edge — they
 *     rely on PhaseState's default slot — so `after` is the honest
 *     representation. (Explicit data deps are something a builder DSL or
 *     YAML front-end would emit when the user names them.)
 *   - WrappedTask.onFailure → a recovery ExecutionNode with id
 *     `<parent>__recovery` plus an `on-failure` edge from the parent
 *     carrying `retryMax: handler.retry`. The recovery node receives
 *     handler.inputMapping and handler.outputId.
 *
 * The output is structurally equivalent to today's runWorkflow() execution
 * but expressed in the canonical model — every existing workflow can run
 * through the new scheduler without behavior change.
 */

import type { Task } from "./task.js";
import type {
  ExecutionEdge,
  ExecutionNode,
  ExecutionPlan,
  InputMapping,
} from "./types.js";

export interface LegacyFailureHandler {
  readonly task: Task;
  readonly retry: number;
  readonly inputMapping?: InputMapping | undefined;
  readonly outputId?: string | undefined;
}

export interface LegacyWrappedTask {
  readonly task: Task;
  readonly inputMapping?: InputMapping | undefined;
  readonly outputId?: string | undefined;
  readonly onFailure?: LegacyFailureHandler | undefined;
}

export interface LegacyWorkflow {
  readonly name: string;
  readonly description: string;
  readonly seeds: readonly object[];
  readonly tasks: readonly LegacyWrappedTask[];
}

function uniquify(names: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const out: string[] = [];
  for (const n of names) {
    if ((counts.get(n) ?? 0) === 1) {
      out.push(n);
      continue;
    }
    const idx = seen.get(n) ?? 0;
    out.push(`${n}#${String(idx)}`);
    seen.set(n, idx + 1);
  }
  return out;
}

export function compileWorkflow(wf: LegacyWorkflow): ExecutionPlan {
  const ids = uniquify(wf.tasks.map((t) => t.task.name));
  const nodes = new Map<string, ExecutionNode>();
  const edges: ExecutionEdge[] = [];

  for (let i = 0; i < wf.tasks.length; i++) {
    const t = wf.tasks[i];
    const id = ids[i];
    if (t === undefined || id === undefined) continue;

    const node: ExecutionNode = {
      id,
      task: t.task,
      inputMapping: t.inputMapping,
      outputId: t.outputId,
    };
    nodes.set(id, node);

    if (i > 0) {
      const prev = ids[i - 1];
      if (prev !== undefined) {
        edges.push({ from: prev, to: id, via: { kind: "after" } });
      }
    }

    if (t.onFailure !== undefined) {
      const recoveryId = `${id}__recovery`;
      nodes.set(recoveryId, {
        id: recoveryId,
        task: t.onFailure.task,
        inputMapping: t.onFailure.inputMapping,
        outputId: t.onFailure.outputId,
      });
      edges.push({
        from: id,
        to: recoveryId,
        via: { kind: "on-failure", retryMax: t.onFailure.retry },
      });
    }
  }

  return {
    id: wf.name,
    description: wf.description,
    seeds: wf.seeds,
    nodes,
    edges,
  };
}
