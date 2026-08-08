/**
 * Topological helpers for the operator graph (§7.1).
 * Cycles are forbidden unless they pass through an explicit Feedback operator (M1).
 */

import type { GraphDocument, WireEdge } from "./types.js";

export class GraphCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphCycleError";
  }
}

/** Build adjacency: opId → list of downstream opIds via data wires. */
export function buildDownstreamAdjacency(
  wires: readonly WireEdge[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const w of wires) {
    const from = w.from.opId;
    const to = w.to.opId;
    const list = adj.get(from);
    if (list) list.push(to);
    else adj.set(from, [to]);
  }
  return adj;
}

/**
 * Detect directed cycles in the wire graph.
 * Cycles through FX/Feedback are allowed (§7.1) — Feedback nodes are removed
 * from the adjacency used for cycle detection (they break the loop).
 * Modulation edges are not data deps for cycle purposes.
 */
export function assertAcyclic(
  doc: Pick<GraphDocument, "nodes" | "wires">,
): void {
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const feedbackIds = new Set(
    doc.nodes
      .filter((n) => n.type === "FX/Feedback")
      .map((n) => n.id),
  );
  // Drop wires that enter or leave Feedback — Feedback is the legal cycle break.
  const wiresForCycle = doc.wires.filter(
    (w) => !feedbackIds.has(w.from.opId) && !feedbackIds.has(w.to.opId),
  );
  const adj = buildDownstreamAdjacency(wiresForCycle);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const stack: string[] = [];

  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      if (!nodeIds.has(next)) continue;
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        const path = stack.slice(cycleStart).concat(next).join(" → ");
        throw new GraphCycleError(
          `Graph contains a cycle (Feedback required for cycles): ${path}`,
        );
      }
      if (c === WHITE) visit(next);
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of nodeIds) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
}
