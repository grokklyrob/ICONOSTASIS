/** SRC Seed / Input / MIDI cook tests. */
import { describe, expect, it } from "vitest";
import { inputFactory, SRC_INPUT_TYPE } from "./input.js";
import { midiFactory, SRC_MIDI_TYPE } from "./midi.js";
import { seedFactory, seedToUnit, SRC_SEED_TYPE } from "./seed.js";

describe("SRC/Seed", () => {
  it("hashes seed deterministically", () => {
    expect(seedToUnit(0)).toBeGreaterThanOrEqual(0);
    expect(seedToUnit(0)).toBeLessThan(1);
    expect(seedToUnit(42)).toBe(seedToUnit(42));
    const op = seedFactory.create("s", { seed: 3 });
    op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      getInput: () => undefined,
      getParam: () => 3,
      getBaseParam: () => 3,
      setOutput: () => {},
    });
    expect(op.getOutput("seed")).toBe(3);
    expect(op.getOutput("unit")).toBe(seedToUnit(3));
    expect(SRC_SEED_TYPE).toBe("SRC/Seed");
  });
});

describe("SRC/Input", () => {
  it("reads host input frame", () => {
    const op = inputFactory.create("i", { watchKey: "a", hitTag: "seraph" });
    op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      input: {
        pointerX: 0.2,
        pointerY: 0.8,
        pointerVx: 1,
        pointerVy: -1,
        pointerDown: true,
        keysDown: ["a"],
        keysEdge: ["a"],
        hitTag: "seraph",
      },
      getInput: () => undefined,
      getParam: (id) => (id === "watchKey" ? "a" : "seraph"),
      getBaseParam: () => undefined,
      setOutput: () => {},
    });
    expect(op.getOutput("x")).toBe(0.2);
    expect(op.getOutput("down")).toBe(1);
    expect(op.getOutput("key")).toBe(1);
    expect(op.getOutput("keyEdge")).toBe(1);
    expect(op.getOutput("hit")).toBe(1);
    expect(SRC_INPUT_TYPE).toBe("SRC/Input");
  });
});

describe("SRC/MIDI", () => {
  it("reads CC and note from host frame", () => {
    const op = midiFactory.create("m", { ccNumber: 7, noteNumber: 60 });
    op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      midi: {
        cc: { 7: 0.75 },
        notes: { 60: 0.9 },
        noteOn: [60],
        noteOff: [],
      },
      getInput: () => undefined,
      getParam: (id) => (id === "ccNumber" ? 7 : 60),
      getBaseParam: () => undefined,
      setOutput: () => {},
    });
    expect(op.getOutput("cc")).toBeCloseTo(0.75);
    expect(op.getOutput("note")).toBeCloseTo(0.9);
    expect(op.getOutput("noteOn")).toBe(1);
    expect(SRC_MIDI_TYPE).toBe("SRC/MIDI");
  });
});
