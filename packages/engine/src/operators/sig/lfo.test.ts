/**
 * SIG/LFO cook tests — colocated (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import { createGraph } from "../../graph/graph.js";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { evalLfoWave, lfoFactory } from "./lfo.js";

function makeSinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [{ id: "in", type: "signal" as const }],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & { last: number } {
      let last = 0;
      const instance: OperatorInstance & { last: number } = {
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
      return instance;
    },
  };
}

describe("evalLfoWave", () => {
  it("sine at 0 and 0.25", () => {
    expect(evalLfoWave("sine", 0)).toBeCloseTo(0, 6);
    expect(evalLfoWave("sine", 0.25)).toBeCloseTo(1, 6);
  });

  it("square and saw endpoints", () => {
    expect(evalLfoWave("square", 0)).toBe(1);
    expect(evalLfoWave("square", 0.5)).toBe(-1);
    expect(evalLfoWave("saw", 0)).toBeCloseTo(-1, 6);
    expect(evalLfoWave("saw", 0.5)).toBeCloseTo(0, 6);
  });
});

describe("SIG/LFO", () => {
  it("cook returns void", () => {
    const op = lfoFactory.create("lfo", {
      waveform: "sine",
      frequency: 1,
      amp: 1,
      offset: 0,
      phase: 0,
    });
    const result = op.cook({
      time: 0,
      delta: 0.016,
      frame: 0,
      getInput: () => undefined,
      getParam: (id) => {
        const defaults: Record<string, string | number> = {
          waveform: "sine",
          frequency: 1,
          amp: 1,
          offset: 0,
          phase: 0,
        };
        return defaults[id] ?? 0;
      },
      getBaseParam: () => 0,
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
  });

  it("free-runs a known sine sample after 0.25s at 1Hz", () => {
    const registry = new OperatorRegistry();
    registry.register(lfoFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "lfo",
          type: "SIG/LFO",
          params: {
            waveform: "sine",
            frequency: 1,
            amp: 1,
            offset: 0,
            phase: 0,
          },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "lfo", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    // Integrate from t=0 → t=0.25 via two ticks so free-run phase advances.
    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    evaluator.tick({ time: 0.25, delta: 0.25, frame: 1 });

    const sink = graph.getInstance("sink") as OperatorInstance & { last: number };
    // 0.25 cycles of sine → peak
    expect(sink.last).toBeCloseTo(1, 5);
  });

  it("applies amp and offset", () => {
    const registry = new OperatorRegistry();
    registry.register(lfoFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "lfo",
          type: "SIG/LFO",
          params: {
            waveform: "sine",
            frequency: 1,
            amp: 2,
            offset: 3,
            phase: 0.25, // phase param alone at t=0 → sine peak before integration
          },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "lfo", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0, delta: 0, frame: 0 });

    const sink = graph.getInstance("sink") as OperatorInstance & { last: number };
    // sin(0.25 cycles)*2 + 3 = 1*2+3 = 5
    expect(sink.last).toBeCloseTo(5, 5);
  });

  it("modulation of frequency changes the period", () => {
    const registry = new OperatorRegistry();
    registry.register(lfoFactory);
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
        { id: "freq", type: "Test/Const", params: { value: 2 } },
        {
          id: "lfo",
          type: "SIG/LFO",
          params: {
            waveform: "sine",
            frequency: 1, // base; modulated to 2
            amp: 1,
            offset: 0,
            phase: 0,
          },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "lfo", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [
        {
          id: "m1",
          from: { opId: "freq", port: "out" },
          to: { opId: "lfo", param: "frequency" },
          // identity map: signal 2 → frequency 2
          map: { in: [0, 2], out: [0, 2] },
        },
      ],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    // At 2Hz, after 0.125s → 0.25 cycles → sine peak
    evaluator.tick({ time: 0.125, delta: 0.125, frame: 1 });

    const sink = graph.getInstance("sink") as OperatorInstance & { last: number };
    expect(sink.last).toBeCloseTo(1, 5);

    // Base param remains 1
    expect(graph.getInstance("lfo").params["frequency"]).toBe(1);
  });

  it("optional phase input overrides free-run integration", () => {
    const registry = new OperatorRegistry();
    registry.register(lfoFactory);
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
        { id: "ph", type: "Test/Const", params: { value: 0.25 } },
        {
          id: "lfo",
          type: "SIG/LFO",
          params: {
            waveform: "sine",
            frequency: 99,
            amp: 1,
            offset: 0,
            phase: 0,
          },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w0",
          from: { opId: "ph", port: "out" },
          to: { opId: "lfo", port: "phase" },
        },
        {
          id: "w1",
          from: { opId: "lfo", port: "out" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry);
    // Even at large free-run frequency, wired phase 0.25 → sine peak
    evaluator.tick({ time: 10, delta: 10, frame: 1 });

    const sink = graph.getInstance("sink") as OperatorInstance & { last: number };
    expect(sink.last).toBeCloseTo(1, 5);
  });
});
