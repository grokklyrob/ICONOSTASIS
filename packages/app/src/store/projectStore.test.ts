import { describe, expect, it } from "vitest";
import {
  ProjectStore,
  portsCompatible,
} from "./projectStore.js";

const empty = {
  schemaVersion: 1 as const,
  nodes: [],
  wires: [],
  modulations: [],
};

describe("ProjectStore", () => {
  it("adds and removes nodes", () => {
    const s = new ProjectStore(empty);
    const id = s.addNode("SIG/LFO", [10, 20]);
    expect(s.getState().doc.nodes).toHaveLength(1);
    expect(s.getState().selection).toBe(id);
    s.removeNode(id);
    expect(s.getState().doc.nodes).toHaveLength(0);
  });

  it("undo restores prior graph", () => {
    const s = new ProjectStore(empty);
    s.addNode("SIG/Math", [0, 0]);
    s.undo();
    expect(s.getState().doc.nodes).toHaveLength(0);
  });

  it("portsCompatible is strict equality", () => {
    expect(portsCompatible("signal", "signal")).toBe(true);
    expect(portsCompatible("signal", "field")).toBe(false);
  });
});
