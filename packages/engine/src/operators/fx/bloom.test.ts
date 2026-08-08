/**
 * FX/Bloom cook tests — colocated (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { isBloomPassState } from "../../render/bloomPass.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { bloomFactory, FX_BLOOM_TYPE } from "./bloom.js";

function makeSinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [{ id: "field", type: "field" as const }],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & { last: unknown } {
      let last: unknown;
      const instance: OperatorInstance & { last: unknown } = {
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
          last = ctx.getInput("field");
        },
        dispose() {},
        serialize: () => ({}),
      };
      return instance;
    },
  };
}

describe("FX/Bloom", () => {
  it("cook returns void", () => {
    const op = bloomFactory.create("b", {
      threshold: 0.5,
      strength: 1,
      radius: 1,
      enabled: true,
    });
    const result = op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      getInput: () => undefined,
      getParam: (id) => {
        const p: Record<string, number | boolean> = {
          threshold: 0.5,
          strength: 1,
          radius: 1,
          enabled: true,
        };
        return p[id] ?? 0;
      },
      getBaseParam: () => undefined,
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
  });

  it("publishes BloomPassState on field output", () => {
    const registry = new OperatorRegistry();
    registry.register(bloomFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "bloom",
          type: FX_BLOOM_TYPE,
          params: { threshold: 0.62, strength: 1.8, radius: 0.85 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "bloom", port: "field" },
          to: { opId: "sink", port: "field" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0, delta: 0, frame: 0 });

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: unknown;
    };
    expect(isBloomPassState(sink.last)).toBe(true);
    if (isBloomPassState(sink.last)) {
      expect(sink.last.strength).toBeCloseTo(1.8, 5);
      expect(sink.last.threshold).toBeCloseTo(0.62, 5);
      expect(sink.last.radius).toBeCloseTo(0.85, 5);
    }
  });

  it("modulation of strength changes published pass state without mutating base", () => {
    const registry = new OperatorRegistry();
    registry.register(bloomFactory);
    registry.register(makeSinkFactory());

    const constFactory = {
      type: "Test/Const",
      family: "SRC" as const,
      inputs: [],
      outputs: [{ id: "out", type: "signal" as const }],
      params: [
        {
          id: "value",
          type: "float" as const,
          default: 0,
          modulatable: false,
          exposable: false,
        },
      ],
      create(id: string, params: Record<string, number | string | boolean>) {
        const outputs = { out: Number(params["value"] ?? 0) };
        const inst: OperatorInstance = {
          id,
          type: "Test/Const",
          family: "SRC",
          params: { value: outputs.out },
          dirty: true,
          alwaysDirty: true,
          getOutput: (p) => {
            if (p !== "out") throw new Error(p);
            return outputs.out;
          },
          cook(ctx) {
            outputs.out = Number(ctx.getParam("value"));
            ctx.setOutput("out", outputs.out);
          },
          dispose() {},
          serialize: () => ({ value: outputs.out }),
        };
        return inst;
      },
    };
    registry.register(constFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "drv", type: "Test/Const", params: { value: 0.75 } },
        {
          id: "bloom",
          type: FX_BLOOM_TYPE,
          params: { threshold: 0.62, strength: 1.0, radius: 0.85 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "bloom", port: "field" },
          to: { opId: "sink", port: "field" },
        },
      ],
      modulations: [
        {
          id: "m1",
          from: { opId: "drv", port: "out" },
          to: { opId: "bloom", param: "strength" },
          map: { in: [0, 1], out: [1.2, 3.0] },
        },
      ],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0, delta: 0, frame: 0 });

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: { strength: number };
    };
    // 0.75 maps [0,1]→[1.2,3.0] → 1.2 + 0.75*1.8 = 2.55
    expect(sink.last.strength).toBeCloseTo(2.55, 5);
    expect(graph.getInstance("bloom").params["strength"]).toBe(1.0);
  });
});
