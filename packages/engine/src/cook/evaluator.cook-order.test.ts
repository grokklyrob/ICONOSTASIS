/**
 * FIRST headless cook-order test (architecture.md §7.1–§7.2, AMD-01, AMD-14).
 * Written before the evaluator implementation it constrains.
 */
import { describe, expect, it } from "vitest";
import type { OperatorFactory, OperatorInstance } from "../types/operator.js";
import { createGraph } from "../graph/graph.js";
import { OperatorRegistry } from "../registry/registry.js";
import { GraphEvaluator } from "./evaluator.js";

type TestOutputs = {
  out: number;
};

function createTestSource(): OperatorFactory {
  return {
    type: "Test/Source",
    family: "SRC",
    inputs: [],
    outputs: [{ id: "out", type: "signal" }],
    params: [
      {
        id: "value",
        type: "float",
        default: 1,
        modulatable: false,
        exposable: false,
      },
    ],
    create(id, params): OperatorInstance {
      let cookCount = 0;
      const outputs: TestOutputs = { out: 0 };
      const instance: OperatorInstance & { readonly cookCount: number } = {
        id,
        type: "Test/Source",
        family: "SRC",
        params: { value: Number(params["value"] ?? 1) },
        dirty: true,
        alwaysDirty: false,
        get cookCount() {
          return cookCount;
        },
        getOutput(port) {
          if (port !== "out") throw new Error(`unknown port ${port}`);
          return outputs.out;
        },
        cook(ctx) {
          cookCount += 1;
          const value = Number(ctx.getParam("value"));
          ctx.setOutput("out", value);
          outputs.out = value;
        },
        dispose() {},
        serialize() {
          return { value: Number(instance.params["value"] ?? 0) };
        },
      };
      return instance;
    },
  };
}

function createTestMid(): OperatorFactory {
  return {
    type: "Test/Mid",
    family: "SIG",
    inputs: [{ id: "in", type: "signal" }],
    outputs: [{ id: "out", type: "signal" }],
    params: [
      {
        id: "gain",
        type: "float",
        default: 1,
        modulatable: true,
        exposable: true,
      },
    ],
    create(id, params): OperatorInstance {
      let cookCount = 0;
      const outputs: TestOutputs = { out: 0 };
      let lastEffectiveGain = 1;
      const instance: OperatorInstance & {
        readonly cookCount: number;
        readonly lastEffectiveGain: number;
      } = {
        id,
        type: "Test/Mid",
        family: "SIG",
        params: { gain: Number(params["gain"] ?? 1) },
        dirty: true,
        alwaysDirty: false,
        get cookCount() {
          return cookCount;
        },
        get lastEffectiveGain() {
          return lastEffectiveGain;
        },
        getOutput(port) {
          if (port !== "out") throw new Error(`unknown port ${port}`);
          return outputs.out;
        },
        cook(ctx) {
          cookCount += 1;
          const input = Number(ctx.getInput("in") ?? 0);
          const gain = Number(ctx.getParam("gain"));
          lastEffectiveGain = gain;
          const out = input * gain;
          ctx.setOutput("out", out);
          outputs.out = out;
        },
        dispose() {},
        serialize() {
          return { gain: Number(instance.params["gain"] ?? 0) };
        },
      };
      return instance;
    },
  };
}

function createTestSink(): OperatorFactory {
  return {
    type: "Test/Sink",
    family: "OUT",
    inputs: [{ id: "in", type: "signal" }],
    outputs: [],
    params: [],
    create(id): OperatorInstance {
      let cookCount = 0;
      let lastInput = 0;
      const orderLog: string[] = [];
      const instance: OperatorInstance & {
        readonly cookCount: number;
        readonly lastInput: number;
        readonly orderLog: string[];
      } = {
        id,
        type: "Test/Sink",
        family: "OUT",
        params: {},
        dirty: true,
        alwaysDirty: true,
        get cookCount() {
          return cookCount;
        },
        get lastInput() {
          return lastInput;
        },
        get orderLog() {
          return orderLog;
        },
        getOutput() {
          return undefined;
        },
        cook(ctx) {
          cookCount += 1;
          lastInput = Number(ctx.getInput("in") ?? 0);
          orderLog.push("sink");
        },
        dispose() {},
        serialize() {
          return {};
        },
      };
      return instance;
    },
  };
}

function setup() {
  const registry = new OperatorRegistry();
  registry.register(createTestSource());
  registry.register(createTestMid());
  registry.register(createTestSink());

  const graph = createGraph({
    schemaVersion: 1,
    nodes: [
      { id: "src", type: "Test/Source", params: { value: 3 } },
      { id: "mid", type: "Test/Mid", params: { gain: 2 } },
      { id: "sink", type: "Test/Sink", params: {} },
    ],
    wires: [
      {
        id: "w1",
        from: { opId: "src", port: "out" },
        to: { opId: "mid", port: "in" },
      },
      {
        id: "w2",
        from: { opId: "mid", port: "out" },
        to: { opId: "sink", port: "in" },
      },
    ],
    modulations: [],
  });

  const evaluator = new GraphEvaluator(graph, registry);
  return { graph, registry, evaluator };
}

describe("GraphEvaluator cook order (§7.1 pull-eval, AMD-01)", () => {
  it("cooks dependencies before consumers when an OUT sink is pulled", () => {
    const { evaluator, graph } = setup();
    const order: string[] = [];

    for (const id of ["src", "mid", "sink"] as const) {
      const op = graph.getInstance(id);
      const original = op.cook.bind(op);
      op.cook = (ctx) => {
        order.push(id);
        original(ctx);
      };
    }

    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });

    expect(order).toEqual(["src", "mid", "sink"]);
    expect(graph.getInstance("sink")).toMatchObject({ lastInput: 6 }); // 3 * 2
  });

  it("skips clean subtrees on a second frame with no dirty flags", () => {
    const { evaluator, graph } = setup();

    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });
    const src = graph.getInstance("src") as OperatorInstance & {
      cookCount: number;
    };
    const mid = graph.getInstance("mid") as OperatorInstance & {
      cookCount: number;
    };
    const sink = graph.getInstance("sink") as OperatorInstance & {
      cookCount: number;
    };

    expect(src.cookCount).toBe(1);
    expect(mid.cookCount).toBe(1);
    expect(sink.cookCount).toBe(1);

    // Explicitly clear dirty on all non-alwaysDirty ops.
    src.dirty = false;
    mid.dirty = false;
    // sink stays alwaysDirty

    evaluator.tick({ time: 1 / 60, delta: 1 / 60, frame: 1 });

    expect(src.cookCount).toBe(1);
    expect(mid.cookCount).toBe(1);
    expect(sink.cookCount).toBe(2);
    expect(sink).toMatchObject({ lastInput: 6 }); // held outputs still pull
  });

  it("applies modulation edges to effective params without mutating base params (AMD-14)", () => {
    const registry = new OperatorRegistry();
    registry.register(createTestSource());
    registry.register(createTestMid());
    registry.register(createTestSink());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "src", type: "Test/Source", params: { value: 0.5 } },
        { id: "mid", type: "Test/Mid", params: { gain: 1 } },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "src", port: "out" },
          to: { opId: "mid", port: "in" },
        },
        {
          id: "w2",
          from: { opId: "mid", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      // First-class modulation edge: signal → modulatable param
      modulations: [
        {
          id: "m1",
          from: { opId: "src", port: "out" },
          to: { opId: "mid", param: "gain" },
          map: { in: [0, 1], out: [0, 4] },
        },
      ],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });

    const mid = graph.getInstance("mid") as OperatorInstance & {
      lastEffectiveGain: number;
      params: Record<string, unknown>;
    };
    const sink = graph.getInstance("sink") as OperatorInstance & {
      lastInput: number;
    };

    // value 0.5 maps through [0,1]→[0,4] → effective gain 2
    expect(mid.lastEffectiveGain).toBe(2);
    // base params remain the serialized default (not overwritten by modulation)
    expect(mid.params["gain"]).toBe(1);
    // mid: in=0.5 * gain=2 = 1
    expect(sink.lastInput).toBe(1);
  });

  it("cook returns void and must not return a Promise (AMD-01)", () => {
    const { evaluator, graph } = setup();
    const mid = graph.getInstance("mid");
    const result = mid.cook({
      time: 0,
      delta: 0,
      frame: 0,
      getInput: () => 1,
      getParam: () => 2,
      setOutput: () => {},
      getBaseParam: () => 2,
    });
    expect(result).toBeUndefined();

    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });
    // Type-level: OperatorInstance.cook is typed as returning void (not Promise).
    // Runtime: tick itself completes synchronously.
    expect(graph.getInstance("sink")).toMatchObject({ cookCount: 1 });
  });

  it("rejects cycles that do not go through an explicit Feedback operator", () => {
    const registry = new OperatorRegistry();
    registry.register(createTestSource());
    registry.register(createTestMid());

    expect(() =>
      createGraph({
        schemaVersion: 1,
        nodes: [
          { id: "a", type: "Test/Mid", params: { gain: 1 } },
          { id: "b", type: "Test/Mid", params: { gain: 1 } },
        ],
        wires: [
          {
            id: "w1",
            from: { opId: "a", port: "out" },
            to: { opId: "b", port: "in" },
          },
          {
            id: "w2",
            from: { opId: "b", port: "out" },
            to: { opId: "a", port: "in" },
          },
        ],
        modulations: [],
      }),
    ).toThrow(/cycle/i);
  });
});
