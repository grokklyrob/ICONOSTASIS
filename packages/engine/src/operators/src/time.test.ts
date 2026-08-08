/**
 * SRC/Time cook tests — colocated (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import { createGraph } from "../../graph/graph.js";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { timeFactory } from "./time.js";

function makeSinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [
      { id: "time", type: "signal" as const },
      { id: "delta", type: "signal" as const },
      { id: "frame", type: "signal" as const },
    ],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & {
      last: { time: number; delta: number; frame: number };
    } {
      const last = { time: 0, delta: 0, frame: 0 };
      const instance: OperatorInstance & {
        last: { time: number; delta: number; frame: number };
      } = {
        id,
        type: "Test/Sink",
        family: "OUT",
        params: {},
        dirty: true,
        alwaysDirty: true,
        last,
        getOutput: () => undefined,
        cook(ctx) {
          last.time = Number(ctx.getInput("time") ?? 0);
          last.delta = Number(ctx.getInput("delta") ?? 0);
          last.frame = Number(ctx.getInput("frame") ?? 0);
        },
        dispose() {},
        serialize: () => ({}),
      };
      return instance;
    },
  };
}

describe("SRC/Time", () => {
  it("cook returns void", () => {
    const op = timeFactory.create("t", { speed: 1 });
    const result = op.cook({
      time: 1,
      delta: 0.016,
      frame: 60,
      getInput: () => undefined,
      getParam: () => 1,
      getBaseParam: () => 1,
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
  });

  it("emits time, delta, and frame from the host clock", () => {
    const registry = new OperatorRegistry();
    registry.register(timeFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "time", type: "SRC/Time", params: { speed: 1 } },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "time", port: "time" },
          to: { opId: "sink", port: "time" },
        },
        {
          id: "w2",
          from: { opId: "time", port: "delta" },
          to: { opId: "sink", port: "delta" },
        },
        {
          id: "w3",
          from: { opId: "time", port: "frame" },
          to: { opId: "sink", port: "frame" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0.5, delta: 1 / 60, frame: 30 });

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: { time: number; delta: number; frame: number };
    };
    expect(sink.last.time).toBeCloseTo(0.5, 6);
    expect(sink.last.delta).toBeCloseTo(1 / 60, 6);
    expect(sink.last.frame).toBe(30);
  });

  it("scales time and delta by modulatable speed", () => {
    const registry = new OperatorRegistry();
    registry.register(timeFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "time", type: "SRC/Time", params: { speed: 2 } },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "time", port: "time" },
          to: { opId: "sink", port: "time" },
        },
        {
          id: "w2",
          from: { opId: "time", port: "delta" },
          to: { opId: "sink", port: "delta" },
        },
        {
          id: "w3",
          from: { opId: "time", port: "frame" },
          to: { opId: "sink", port: "frame" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 1, delta: 0.1, frame: 10 });

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: { time: number; delta: number; frame: number };
    };
    expect(sink.last.time).toBeCloseTo(2, 6);
    expect(sink.last.delta).toBeCloseTo(0.2, 6);
    expect(sink.last.frame).toBe(10); // frame index is not scaled
  });

  it("advances across two frames with matching deltas", () => {
    const registry = new OperatorRegistry();
    registry.register(timeFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "time", type: "SRC/Time", params: { speed: 1 } },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "time", port: "time" },
          to: { opId: "sink", port: "time" },
        },
        {
          id: "w2",
          from: { opId: "time", port: "delta" },
          to: { opId: "sink", port: "delta" },
        },
        {
          id: "w3",
          from: { opId: "time", port: "frame" },
          to: { opId: "sink", port: "frame" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: { time: number; delta: number; frame: number };
    };

    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });
    expect(sink.last.frame).toBe(0);
    expect(sink.last.delta).toBeCloseTo(1 / 60, 6);

    evaluator.tick({ time: 1 / 60, delta: 1 / 60, frame: 1 });
    expect(sink.last.time).toBeCloseTo(1 / 60, 6);
    expect(sink.last.delta).toBeCloseTo(1 / 60, 6);
    expect(sink.last.frame).toBe(1);
  });
});
