/**
 * TEST/SyntheticAsync — Arrival Law probe tests (architecture.md §7.1, §18 M1).
 */
import { afterEach, describe, expect, it } from "vitest";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { GpuFadeQueue } from "../../async/gpuFadeQueue.js";
import {
  resetSyntheticGpuFadeQueue,
  setSyntheticGpuFadeQueue,
  syntheticAsyncFactory,
  TEST_SYNTHETIC_ASYNC_TYPE,
  type SyntheticAsyncView,
} from "./syntheticAsync.js";

type SynthOp = OperatorInstance & { asyncView: SyntheticAsyncView };

function makeSinkFactory(inputPort: string) {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [{ id: "in", type: "signal" as const }],
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
          last = ctx.getInput("in");
        },
        dispose() {},
        serialize: () => ({}),
      };
      return instance;
    },
  };
}

/** Flushable deferred scheduler — no real timers in unit tests. */
function createScheduler() {
  const q: Array<{ fn: () => void; delayMs: number }> = [];
  const schedule = (fn: () => void, delayMs: number) => {
    q.push({ fn, delayMs });
  };
  const flush = () => {
    const batch = q.splice(0, q.length);
    for (const item of batch) item.fn();
  };
  const pending = () => q.length;
  return { schedule, flush, pending };
}

function harness(mode: string, extraParams: Record<string, unknown> = {}) {
  const { schedule, flush, pending } = createScheduler();
  const registry = new OperatorRegistry();
  registry.register(syntheticAsyncFactory);
  registry.register(makeSinkFactory("in"));

  const outPort =
    mode === "text-stream" || mode === "text-replace"
      ? "text"
      : mode === "audio"
        ? "media"
        : mode === "field"
          ? "field"
          : mode === "geometry"
            ? "geometry"
            : "signal";

  // Sink only accepts signal type in PortSpec — evaluator does not type-check
  // wire types at runtime in M0; use signal port for numeric modes and read
  // asyncView for others.
  const graph = createGraph({
    schemaVersion: 1,
    nodes: [
      {
        id: "syn",
        type: TEST_SYNTHETIC_ASYNC_TYPE,
        params: {
          mode,
          generation: 0,
          latencyMs: 0,
          arrivalWindowMs: 100,
          payload: "",
          streamChunk: "",
          cacheScope: "station",
          stationId: "st1",
          audioPlaying: false,
          ...extraParams,
        },
        position: [0, 0],
      },
      {
        id: "sink",
        type: "Test/Sink",
        params: {},
        position: [200, 0],
      },
    ],
    wires: [
      {
        id: "w1",
        from: { opId: "syn", port: "signal" },
        to: { opId: "sink", port: "in" },
      },
    ],
    modulations: [],
  });

  const evaluator = new GraphEvaluator(graph, registry, {
    scheduleDeferred: schedule,
  });
  const syn = graph.getInstance("syn") as SynthOp;

  return { evaluator, syn, flush, pending, outPort, graph };
}

afterEach(() => {
  resetSyntheticGpuFadeQueue("wayside");
});

describe("TEST/SyntheticAsync", () => {
  it("cook returns void and never awaits settle", () => {
    const op = syntheticAsyncFactory.create("s", {
      mode: "signal",
      generation: 1,
      latencyMs: 0,
      arrivalWindowMs: 100,
      payload: "42",
      streamChunk: "",
      cacheScope: "station",
      stationId: "default",
      audioPlaying: false,
    }) as SynthOp;
    const deferred: Array<() => void> = [];
    const result = op.cook({
      time: 0,
      delta: 0.016,
      frame: 0,
      scheduleDeferred: (fn) => deferred.push(fn),
      getInput: () => undefined,
      getParam: (id) => {
        const p = op.params[id];
        if (p === undefined) throw new Error(id);
        return p;
      },
      getBaseParam: (id) => op.params[id],
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
    expect(op.asyncView.status).toBe("pending");
    expect(deferred.length).toBe(1);
  });

  it("signal: holds lastGood during pending, crossfades on arrival", () => {
    const { evaluator, syn, flush } = harness("signal", {
      generation: 1,
      payload: "10",
      arrivalWindowMs: 100,
    });

    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    expect(syn.asyncView.status).toBe("pending");
    expect(syn.asyncView.lastGoodValue).toBeUndefined();

    flush();
    // settle mutates state; next tick advances presentation
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(syn.asyncView.status).toBe("fresh");
    expect(syn.asyncView.presented).toBe(10);
    expect(syn.asyncView.lastGoodValue).toBe(10);

    // Second generation → crossfade from 10 toward 30
    syn.params.generation = 2;
    syn.params.payload = "30";
    syn.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    expect(syn.asyncView.status).toBe("pending");
    expect(syn.asyncView.presented).toBe(10); // hold during pending
    flush();
    evaluator.tick({ time: 0.048, delta: 0.05, frame: 3 }); // 50ms of 100ms window
    expect(syn.asyncView.presentation).toBe("fading");
    expect(Number(syn.asyncView.presented)).toBeGreaterThan(10);
    expect(Number(syn.asyncView.presented)).toBeLessThan(30);
  });

  it("text-stream: append-only growth", () => {
    const { evaluator, syn, flush } = harness("text-stream", {
      generation: 1,
      payload: "In ",
      streamChunk: "principio",
    });
    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    flush();
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(syn.asyncView.presented).toBe("In principio");
    expect(syn.asyncView.presentation).toBe("current");
    expect(syn.asyncView.lastGoodValue).toBe("In principio");
  });

  it("text-replace: holds prior text then atomic swap", () => {
    const { evaluator, syn, flush } = harness("text-replace", {
      generation: 1,
      payload: "old",
    });
    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    flush();
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(syn.asyncView.presented).toBe("old");

    syn.params.generation = 2;
    syn.params.payload = "new";
    syn.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    flush();
    // Fresh settle: queued hold
    expect(syn.asyncView.presentation).toBe("queued");
    expect(syn.asyncView.presented).toBe("old");
    // Next cook commits swap
    evaluator.tick({ time: 0.048, delta: 0.016, frame: 3 });
    expect(syn.asyncView.presented).toBe("new");
    expect(syn.asyncView.presentation).toBe("current");
  });

  it("audio: queues while playing; cue promotes", () => {
    const { evaluator, syn, flush, graph } = harness("audio", {
      generation: 1,
      payload: "a",
      audioPlaying: false,
    });
    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    flush();
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(syn.asyncView.presented).toBe("audio:a");

    syn.params.generation = 2;
    syn.params.payload = "b";
    syn.params.audioPlaying = true;
    syn.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    flush();
    evaluator.tick({ time: 0.048, delta: 0.016, frame: 3 });
    expect(syn.asyncView.presented).toBe("audio:a");
    expect(syn.asyncView.audioQueued).toBe("audio:b");
    expect(syn.asyncView.presentation).toBe("queued");

    // Edge-trigger cue via input wire: inject by cooking with getInput — use
    // a second tick after we manually set a cue source. Simplest: cook with
    // a temporary input by rebinding. Here we set cue through a small graph
    // param hack: call cook with cue true via evaluator input store.
    // Wire a constant source instead.
    void graph;
    // Direct cook with cue:
    const deferred: Array<() => void> = [];
    syn.cook({
      time: 0.064,
      delta: 0.016,
      frame: 4,
      scheduleDeferred: (fn) => deferred.push(fn),
      getInput: (port) => (port === "cue" ? true : undefined),
      getParam: (id) => {
        const p = syn.params[id];
        if (p === undefined) throw new Error(id);
        return p;
      },
      getBaseParam: (id) => syn.params[id],
      setOutput: () => {},
    });
    expect(syn.asyncView.presented).toBe("audio:b");
    expect(syn.asyncView.audioQueued).toBeUndefined();
    expect(syn.asyncView.presentation).toBe("current");
  });

  it("fail: sets error and retains lastGoodValue", () => {
    const { evaluator, syn, flush } = harness("signal", {
      generation: 1,
      payload: "7",
    });
    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    flush();
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(syn.asyncView.lastGoodValue).toBe(7);

    syn.params.mode = "fail";
    syn.params.generation = 2;
    syn.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    flush();
    evaluator.tick({ time: 0.048, delta: 0.016, frame: 3 });
    expect(syn.asyncView.status).toBe("error");
    expect(syn.asyncView.errorMessage).toMatch(/forced failure/);
    expect(syn.asyncView.lastGoodValue).toBe(7);
  });

  it("cacheScope station vs global keys differ", () => {
    const { evaluator, syn, flush } = harness("signal", {
      generation: 1,
      payload: "1",
      cacheScope: "station",
      stationId: "alpha",
    });
    evaluator.tick({ time: 0, delta: 0.016, frame: 0 });
    flush();
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    const stationKey = syn.asyncView.cacheKey;
    expect(stationKey).toContain("station:alpha");

    syn.params.cacheScope = "global";
    syn.params.generation = 2;
    syn.params.payload = "2";
    syn.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    flush();
    evaluator.tick({ time: 0.048, delta: 0.016, frame: 3 });
    expect(syn.asyncView.cacheKey).toContain("|global|");
    expect(syn.asyncView.cacheKey).not.toContain("station:alpha");
  });

  it("field: GPU fade cap queues second op; no snap-clear", () => {
    const q = new GpuFadeQueue(1);
    setSyntheticGpuFadeQueue(q);

    const reg = new OperatorRegistry();
    reg.register(syntheticAsyncFactory);
    reg.register(makeSinkFactory("in"));

    const { schedule, flush } = createScheduler();
    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "a",
          type: TEST_SYNTHETIC_ASYNC_TYPE,
          params: {
            mode: "field",
            generation: 1,
            latencyMs: 0,
            arrivalWindowMs: 1000,
            payload: "",
            streamChunk: "",
            cacheScope: "global",
            stationId: "default",
            audioPlaying: false,
          },
          position: [0, 0],
        },
        {
          id: "b",
          type: TEST_SYNTHETIC_ASYNC_TYPE,
          params: {
            mode: "field",
            generation: 1,
            latencyMs: 0,
            arrivalWindowMs: 1000,
            payload: "",
            streamChunk: "",
            cacheScope: "global",
            stationId: "default",
            audioPlaying: false,
          },
          position: [0, 40],
        },
        {
          id: "sink",
          type: "Test/Sink",
          params: {},
          position: [200, 0],
        },
      ],
      wires: [
        {
          id: "w",
          from: { opId: "a", port: "signal" },
          to: { opId: "sink", port: "in" },
        },
      ],
      modulations: [],
    });
    const ev = new GraphEvaluator(graph, reg, { scheduleDeferred: schedule });
    const a = graph.getInstance("a") as SynthOp;
    const b = graph.getInstance("b") as SynthOp;

    // First values on both: empty → current, release slot immediately.
    ev.tick({ time: 0, delta: 0.016, frame: 0 });
    // Only sink pulls a; force cook b by reading through ensure — tick only
    // pulls OUT sinks. Mark both alwaysDirty and cook via direct tick after
    // wiring b into pull path: temporarily cook b by changing generation
    // through direct cook, or add b to sink path. Direct cook for b settle:
    flush();
    // Pull only a via sink. Manually cook b:
    const cookOne = (op: SynthOp) => {
      op.cook({
        time: 0,
        delta: 0.016,
        frame: 0,
        scheduleDeferred: schedule,
        getInput: () => undefined,
        getParam: (id) => {
          const p = op.params[id];
          if (p === undefined) throw new Error(id);
          return p;
        },
        getBaseParam: (id) => op.params[id],
        setOutput: () => {},
      });
    };
    cookOne(a);
    flush();
    cookOne(a);
    expect(a.asyncView.lastGoodValue).toBeDefined();

    cookOne(b);
    flush();
    cookOne(b);
    expect(b.asyncView.lastGoodValue).toBeDefined();

    // Second generation on both while cap=1: first starts fade, second queues.
    a.params.generation = 2;
    b.params.generation = 2;
    cookOne(a);
    cookOne(b);
    flush();
    cookOne(a);
    cookOne(b);

    const presentations = [a.asyncView.presentation, b.asyncView.presentation];
    expect(presentations).toContain("fading");
    expect(presentations).toContain("queued");
    expect(q.queuedCount + q.activeCount).toBeGreaterThanOrEqual(1);
    expect(() => q.snapClearQueueForbidden()).toThrow(/forbidden/);
  });
});
