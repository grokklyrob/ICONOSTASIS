/**
 * SRC/AudioIn cook tests — colocated (AGENTS.md). Pure / headless.
 */
import { describe, expect, it } from "vitest";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { audioInFactory } from "./audioIn.js";

function makeSinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [
      { id: "rms", type: "signal" as const },
      { id: "peak", type: "signal" as const },
      { id: "bandLow", type: "signal" as const },
      { id: "bandMidLow", type: "signal" as const },
      { id: "bandMidHigh", type: "signal" as const },
      { id: "bandHigh", type: "signal" as const },
    ],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & {
      last: Record<string, number>;
    } {
      const last: Record<string, number> = {
        rms: 0,
        peak: 0,
        bandLow: 0,
        bandMidLow: 0,
        bandMidHigh: 0,
        bandHigh: 0,
      };
      const instance: OperatorInstance & { last: Record<string, number> } = {
        id,
        type: "Test/Sink",
        family: "OUT",
        params: {},
        dirty: true,
        alwaysDirty: true,
        last,
        getOutput: () => undefined,
        cook(ctx) {
          for (const k of Object.keys(last)) {
            last[k] = Number(ctx.getInput(k) ?? 0);
          }
        },
        dispose() {},
        serialize: () => ({}),
      };
      return instance;
    },
  };
}

function setup(params: Record<string, number> = { smoothing: 0 }) {
  const registry = new OperatorRegistry();
  registry.register(audioInFactory);
  registry.register(makeSinkFactory());

  const graph = createGraph({
    schemaVersion: 1,
    nodes: [
      { id: "audio", type: "SRC/AudioIn", params },
      { id: "sink", type: "Test/Sink", params: {} },
    ],
    wires: [
      {
        id: "w1",
        from: { opId: "audio", port: "rms" },
        to: { opId: "sink", port: "rms" },
      },
      {
        id: "w2",
        from: { opId: "audio", port: "peak" },
        to: { opId: "sink", port: "peak" },
      },
      {
        id: "w3",
        from: { opId: "audio", port: "bandLow" },
        to: { opId: "sink", port: "bandLow" },
      },
      {
        id: "w4",
        from: { opId: "audio", port: "bandMidLow" },
        to: { opId: "sink", port: "bandMidLow" },
      },
      {
        id: "w5",
        from: { opId: "audio", port: "bandMidHigh" },
        to: { opId: "sink", port: "bandMidHigh" },
      },
      {
        id: "w6",
        from: { opId: "audio", port: "bandHigh" },
        to: { opId: "sink", port: "bandHigh" },
      },
    ],
    modulations: [],
  });

  const evaluator = new GraphEvaluator(graph, registry);
  const sink = graph.getInstance("sink") as OperatorInstance & {
    last: Record<string, number>;
  };
  return { evaluator, sink, graph };
}

describe("SRC/AudioIn", () => {
  it("cook returns void", () => {
    const op = audioInFactory.create("a", { smoothing: 0, fftSize: 2048 });
    const result = op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      getInput: () => undefined,
      getParam: (id) => (id === "smoothing" ? 0 : 2048),
      getBaseParam: () => 0,
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
  });

  it("emits zeros when audio is missing or inactive", () => {
    const { evaluator, sink } = setup({ smoothing: 0 });
    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    expect(sink.last["rms"]).toBe(0);
    expect(sink.last["bandHigh"]).toBe(0);

    evaluator.tick({
      time: 0,
      delta: 0,
      frame: 1,
      audio: { frequency: [1, 1, 1], active: false },
    });
    expect(sink.last["rms"]).toBe(0);
  });

  it("maps a low-bin spike into bandLow with synthetic spectrum", () => {
    const { evaluator, sink } = setup({ smoothing: 0 });
    const frequency = new Float32Array(1024);
    frequency[2] = 1;

    evaluator.tick({
      time: 0,
      delta: 1 / 60,
      frame: 0,
      audio: {
        frequency,
        sampleRate: 48_000,
        active: true,
        timeDomain: new Float32Array([0.5, -0.5]),
      },
    });

    expect(sink.last["bandLow"]!).toBeGreaterThan(sink.last["bandHigh"]!);
    expect(sink.last["peak"]).toBeCloseTo(0.5, 5);
    expect(sink.last["rms"]!).toBeGreaterThan(0);
  });

  it("maps a high-bin spike into bandHigh", () => {
    const { evaluator, sink } = setup({ smoothing: 0 });
    const frequency = new Float32Array(1024);
    frequency[1000] = 1;

    evaluator.tick({
      time: 0,
      delta: 1 / 60,
      frame: 0,
      audio: { frequency, sampleRate: 48_000, active: true },
    });

    expect(sink.last["bandHigh"]!).toBeGreaterThan(sink.last["bandLow"]!);
  });

  it("smoothing lags a step change in band energy", () => {
    const { evaluator, sink } = setup({ smoothing: 0.5 });
    // 1024 bins @ 48kHz: bin 2 ≈ 93 Hz → low band
    const frequency = new Float32Array(1024);
    frequency[2] = 1;

    evaluator.tick({
      time: 0,
      delta: 0,
      frame: 0,
      audio: { frequency, sampleRate: 48_000, active: true },
    });
    const afterFirst = sink.last["bandLow"]!;
    expect(afterFirst).toBeGreaterThan(0);
    expect(afterFirst).toBeLessThan(1);

    evaluator.tick({
      time: 0.016,
      delta: 0.016,
      frame: 1,
      audio: { frequency, sampleRate: 48_000, active: true },
    });
    expect(sink.last["bandLow"]!).toBeGreaterThan(afterFirst);
  });

  it("modulation of smoothing uses effective param without mutating base", () => {
    const registry = new OperatorRegistry();
    registry.register(audioInFactory);
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
        { id: "lag", type: "Test/Const", params: { value: 0 } },
        { id: "audio", type: "SRC/AudioIn", params: { smoothing: 0.9 } },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "audio", port: "bandLow" },
          to: { opId: "sink", port: "bandLow" },
        },
        {
          id: "w2",
          from: { opId: "audio", port: "rms" },
          to: { opId: "sink", port: "rms" },
        },
        {
          id: "w3",
          from: { opId: "audio", port: "peak" },
          to: { opId: "sink", port: "peak" },
        },
        {
          id: "w4",
          from: { opId: "audio", port: "bandMidLow" },
          to: { opId: "sink", port: "bandMidLow" },
        },
        {
          id: "w5",
          from: { opId: "audio", port: "bandMidHigh" },
          to: { opId: "sink", port: "bandMidHigh" },
        },
        {
          id: "w6",
          from: { opId: "audio", port: "bandHigh" },
          to: { opId: "sink", port: "bandHigh" },
        },
      ],
      modulations: [
        {
          id: "m1",
          from: { opId: "lag", port: "out" },
          to: { opId: "audio", param: "smoothing" },
          map: { in: [0, 1], out: [0, 1] },
        },
      ],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    // Fill low bins so raw bandLow mean is high (near 1).
    const frequency = new Float32Array(1024);
    for (let i = 0; i < 8; i++) frequency[i] = 1;
    evaluator.tick({
      time: 0,
      delta: 0,
      frame: 0,
      audio: { frequency, sampleRate: 48_000, active: true },
    });

    // Effective lag 0 → snap to raw in one frame (not base 0.9 lag).
    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: Record<string, number>;
    };
    expect(sink.last["bandLow"]!).toBeGreaterThan(0.5);
    expect(graph.getInstance("audio").params["smoothing"]).toBe(0.9);
  });
});
