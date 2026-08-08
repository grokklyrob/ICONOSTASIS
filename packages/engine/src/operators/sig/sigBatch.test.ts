/**
 * SIG batch cook tests — Math, Smooth, Noise, Logic, Envelope (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { envelopeFactory, SIG_ENVELOPE_TYPE } from "./envelope.js";
import { logicFactory, SIG_LOGIC_TYPE } from "./logic.js";
import { evalMath, mathFactory, SIG_MATH_TYPE } from "./math.js";
import { noiseFactory, SIG_NOISE_TYPE } from "./noise.js";
import { smoothFactory, SIG_SMOOTH_TYPE, smoothStep } from "./smooth.js";

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

describe("evalMath", () => {
  it("covers core ops and remap", () => {
    const r = { in0: 0, in1: 1, out0: 10, out1: 20 };
    expect(evalMath("add", 2, 3, r)).toBe(5);
    expect(evalMath("mul", 2, 3, r)).toBe(6);
    expect(evalMath("remap", 0.5, 0, r)).toBe(15);
    expect(evalMath("clamp", 5, 0, { in0: 0, in1: 2, out0: 0, out1: 1 })).toBe(
      2,
    );
  });
});

describe("SIG/Math", () => {
  it("adds wired inputs", () => {
    const reg = new OperatorRegistry();
    reg.register(mathFactory);
    reg.register(sinkFactory());
    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "m",
          type: SIG_MATH_TYPE,
          params: { op: "add", a: 1, b: 2 },
        },
        { id: "s", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w",
          from: { opId: "m", port: "out" },
          to: { opId: "s", port: "in" },
        },
      ],
      modulations: [],
    });
    new GraphEvaluator(graph, reg).tick({ time: 0, delta: 0.016, frame: 0 });
    expect(
      (graph.getInstance("s") as OperatorInstance & { last: number }).last,
    ).toBe(3);
  });
});

describe("SIG/Smooth", () => {
  it("lags toward target", () => {
    expect(smoothStep(0, 1, 0.1, 0.2)).toBeGreaterThan(0);
    expect(smoothStep(0, 1, 0.1, 0.2)).toBeLessThan(1);
    const op = smoothFactory.create("sm", { tau: 0.5, value: 0 });
    // first cook snaps
    op.cook({
      time: 0,
      delta: 0.016,
      frame: 0,
      getInput: () => 1,
      getParam: (id) => (id === "tau" ? 0.5 : 0),
      getBaseParam: () => 0,
      setOutput: () => {},
    });
    expect(op.getOutput("out")).toBe(1);
    expect(SIG_SMOOTH_TYPE).toBe("SIG/Smooth");
  });
});

describe("SIG/Noise", () => {
  it("is deterministic for fixed seed/time", () => {
    const a = noiseFactory.create("n", {
      mode: "smooth",
      rate: 1,
      amp: 1,
      offset: 0,
      seed: 7,
      bipolar: true,
    });
    const b = noiseFactory.create("n2", {
      mode: "smooth",
      rate: 1,
      amp: 1,
      offset: 0,
      seed: 7,
      bipolar: true,
    });
    const cook = (op: OperatorInstance) =>
      op.cook({
        time: 1.25,
        delta: 0.016,
        frame: 10,
        getInput: () => undefined,
        getParam: (id) => {
          const p = op.params[id];
          if (p === undefined) throw new Error(id);
          return p;
        },
        getBaseParam: (id) => op.params[id],
        setOutput: () => {},
      });
    cook(a);
    cook(b);
    expect(a.getOutput("out")).toBe(b.getOutput("out"));
    expect(SIG_NOISE_TYPE).toBe("SIG/Noise");
  });
});

describe("SIG/Logic", () => {
  it("trigger fires on rising edge only", () => {
    const op = logicFactory.create("l", {
      op: "trigger",
      a: 0,
      b: 0,
      epsilon: 1e-6,
    });
    const cook = (a: number) => {
      op.cook({
        time: 0,
        delta: 0.016,
        frame: 0,
        getInput: (p) => (p === "a" ? a : undefined),
        getParam: (id) => op.params[id] ?? 0,
        getBaseParam: (id) => op.params[id],
        setOutput: () => {},
      });
    };
    cook(0);
    expect(op.getOutput("out")).toBe(0);
    cook(1);
    expect(op.getOutput("out")).toBe(1);
    cook(1);
    expect(op.getOutput("out")).toBe(0);
    expect(SIG_LOGIC_TYPE).toBe("SIG/Logic");
  });
});

describe("SIG/Envelope", () => {
  it("attacks when gated", () => {
    const op = envelopeFactory.create("e", {
      attack: 0.1,
      decay: 0.1,
      sustain: 0.5,
      release: 0.1,
      gate: 0,
    });
    op.cook({
      time: 0,
      delta: 0.05,
      frame: 0,
      getInput: (p) => (p === "gate" ? 1 : undefined),
      getParam: (id) => op.params[id] ?? 0,
      getBaseParam: (id) => op.params[id],
      setOutput: () => {},
    });
    expect(Number(op.getOutput("out"))).toBeGreaterThan(0);
    expect(SIG_ENVELOPE_TYPE).toBe("SIG/Envelope");
  });
});
