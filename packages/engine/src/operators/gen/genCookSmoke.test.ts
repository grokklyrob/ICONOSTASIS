/**
 * Cook-through smoke for the non-text GEN ops.
 *
 * GEN/Icon and GEN/Antiphon filter `stream` out of their param specs while
 * still calling readGenCommonParams, which reads it — and the evaluator throws
 * on an unknown param id. That threw on *every frame* and no test caught it,
 * because a GEN op only cooks when an OUT sink pulls it and no fixture wired
 * one up. These tests wire the sink.
 */

import { describe, expect, it } from "vitest";

import { createGraph } from "../../graph/graph.js";
import { deserializeGraph } from "../../graph/serialize.js";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { OperatorRegistry } from "../../registry/registry.js";
import { registerM2Operators } from "../catalog.js";

function evaluatorFor(doc: Parameters<typeof deserializeGraph>[0]) {
  const registry = new OperatorRegistry();
  registerM2Operators(registry);
  return new GraphEvaluator(createGraph(deserializeGraph(doc)), registry, {});
}

const frame = { time: 0, delta: 1 / 60, frame: 1 };

describe("GEN ops cook when pulled by an OUT sink", () => {
  it("GEN/Antiphon cooks via OUT/AudioOut without throwing", () => {
    const evaluator = evaluatorFor({
      schemaVersion: 1,
      nodes: [
        {
          id: "antiphon1",
          type: "GEN/Antiphon",
          params: { providerInstanceId: "", triggerMode: "event", fire: 0 },
          position: [0, 0],
        },
        {
          id: "audioout1",
          type: "OUT/AudioOut",
          params: { gain: 1, muted: false },
          position: [200, 0],
        },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "antiphon1", port: "media" },
          to: { opId: "audioout1", port: "media" },
        },
      ],
      modulations: [],
    });

    expect(() => evaluator.tick(frame)).not.toThrow();
    // And keeps cooking — the original bug threw on every frame, not just once.
    expect(() => evaluator.tick({ ...frame, frame: 2 })).not.toThrow();
  });

  it("GEN/Icon cooks when its field reaches OUT/Render", () => {
    const evaluator = evaluatorFor({
      schemaVersion: 1,
      nodes: [
        {
          id: "icon1",
          type: "GEN/Icon",
          params: { providerInstanceId: "", triggerMode: "manual", fire: 0 },
          position: [0, 0],
        },
        {
          id: "out1",
          type: "OUT/Render",
          params: {},
          position: [200, 0],
        },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "icon1", port: "field" },
          to: { opId: "out1", port: "bloom" },
        },
      ],
      modulations: [],
    });

    expect(() => evaluator.tick(frame)).not.toThrow();
  });

  it("Oracle's complete pulse survives an arrival that lands between cooks", async () => {
    // The pulse used to be written straight to the frame variable from the
    // async .then(), so the next cook's reset wiped it and no downstream event
    // consumer ever fired. Caption kept working because it reads `text`.
    const registry = new OperatorRegistry();
    registerM2Operators(registry);
    const doc = {
      schemaVersion: 1 as const,
      nodes: [
        {
          // Oracle only invokes with a non-empty wired prompt.
          id: "loom1",
          type: "GEN/PromptLoom",
          params: { template: "sing a line" },
          position: [-200, 0] as [number, number],
        },
        {
          id: "oracle1",
          type: "GEN/Oracle",
          params: {
            providerInstanceId: "p",
            triggerMode: "manual",
            fire: 1,
            stream: true,
            minIntervalMs: 0,
          },
          position: [0, 0] as [number, number],
        },
        {
          // LIT/Caption is family "LIT", not "OUT" — it is NOT a sink, so a
          // graph ending at a caption never cooks. OUT/AudioOut is the sink.
          id: "antiphon1",
          type: "GEN/Antiphon",
          params: { providerInstanceId: "p", triggerMode: "event" },
          position: [200, 0] as [number, number],
        },
        {
          id: "audioout1",
          type: "OUT/AudioOut",
          params: { gain: 1, muted: false },
          position: [400, 0] as [number, number],
        },
      ],
      wires: [
        {
          id: "w0",
          from: { opId: "loom1", port: "text" },
          to: { opId: "oracle1", port: "prompt" },
        },
        {
          id: "w1",
          from: { opId: "oracle1", port: "text" },
          to: { opId: "antiphon1", port: "text" },
        },
        {
          id: "w2",
          from: { opId: "antiphon1", port: "media" },
          to: { opId: "audioout1", port: "media" },
        },
      ],
      modulations: [],
    };

    const evaluator = new GraphEvaluator(
      createGraph(deserializeGraph(doc)),
      registry,
      {
        genHost: {
          invoke: async (req: { cap: string }) =>
            req.cap === "speech.synthesize"
              ? {
                  status: "ok" as const,
                  audioBytes: new ArrayBuffer(8),
                  audioMime: "audio/wav",
                }
              : { status: "ok" as const, text: "lumen gentium" },
        },
      },
    );

    // Frame 1 starts the invoke; the arrival resolves after this tick.
    evaluator.tick({ time: 0, delta: 1 / 60, frame: 1 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Next cook must surface the latched completion exactly once.
    evaluator.tick({ time: 0.016, delta: 1 / 60, frame: 2 });
    expect(evaluator.readPort("oracle1", "complete")).toBe(true);
    expect(evaluator.readPort("oracle1", "text")).toBe("lumen gentium");

    // And it is a one-frame pulse, not a latch that stays high.
    evaluator.tick({ time: 0.032, delta: 1 / 60, frame: 3 });
    expect(evaluator.readPort("oracle1", "complete")).toBe(false);
  });

  it("an OUT sink is what makes a GEN op cook at all", () => {
    // Same Antiphon with nothing downstream: tick must not throw, and the op
    // is simply never pulled. This is why an unwired GEN op silently no-ops.
    const evaluator = evaluatorFor({
      schemaVersion: 1,
      nodes: [
        {
          id: "antiphon1",
          type: "GEN/Antiphon",
          params: { providerInstanceId: "", triggerMode: "event" },
          position: [0, 0],
        },
      ],
      wires: [],
      modulations: [],
    });

    expect(() => evaluator.tick(frame)).not.toThrow();
  });
});
