/**
 * FX/Feedback one-frame delay + legal cycle (§7.1).
 */
import { describe, expect, it } from "vitest";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { assertAcyclic, GraphCycleError } from "../../graph/topology.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { mathFactory, SIG_MATH_TYPE } from "../sig/math.js";
import { feedbackFactory, FX_FEEDBACK_TYPE } from "./feedback.js";

function sinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [{ id: "in", type: "signal" as const }],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & { last: number } {
      let last = 0;
      return {
        id,
        type: "Test/Sink",
        family: "OUT",
        params: {},
        dirty: true,
        alwaysDirty: true,
        get last() {
          return last;
        },
        getOutput: () => undefined,
        cook(ctx) {
          last = Number(ctx.getInput("in") ?? 0);
        },
        dispose() {},
        serialize: () => ({}),
      };
    },
  };
}

describe("FX/Feedback", () => {
  it("allows cycles through Feedback in assertAcyclic", () => {
    expect(() =>
      assertAcyclic({
        nodes: [
          { id: "a", type: "SIG/Math", params: {} },
          { id: "fb", type: "FX/Feedback", params: {} },
        ],
        wires: [
          {
            id: "w1",
            from: { opId: "a", port: "out" },
            to: { opId: "fb", port: "in" },
          },
          {
            id: "w2",
            from: { opId: "fb", port: "out" },
            to: { opId: "a", port: "a" },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects cycles without Feedback", () => {
    expect(() =>
      assertAcyclic({
        nodes: [
          { id: "a", type: "SIG/Math", params: {} },
          { id: "b", type: "SIG/Math", params: {} },
        ],
        wires: [
          {
            id: "w1",
            from: { opId: "a", port: "out" },
            to: { opId: "b", port: "a" },
          },
          {
            id: "w2",
            from: { opId: "b", port: "out" },
            to: { opId: "a", port: "a" },
          },
        ],
      }),
    ).toThrow(GraphCycleError);
  });

  it("delays signal by one frame", () => {
    const reg = new OperatorRegistry();
    reg.register(mathFactory);
    reg.register(feedbackFactory);
    reg.register(sinkFactory());

    // source value via Math constant params → Feedback → Sink
    // Also cycle: fb.out → math.b so math = a_param + delayed
    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "src",
          type: SIG_MATH_TYPE,
          params: { op: "add", a: 5, b: 0 },
        },
        {
          id: "fb",
          type: FX_FEEDBACK_TYPE,
          params: { gain: 1, decay: 1 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "src", port: "out" },
          to: { opId: "fb", port: "in" },
        },
        {
          id: "w2",
          from: { opId: "fb", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [],
    });

    const ev = new GraphEvaluator(graph, reg);
    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: number;
    };

    // Frame 0: delayed starts at 0
    ev.tick({ time: 0, delta: 0.016, frame: 0 });
    expect(sink.last).toBe(0);

    // Frame 1: delayed should be previous input (5)
    ev.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(sink.last).toBe(5);
  });
});
