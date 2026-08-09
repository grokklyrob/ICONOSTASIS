import { describe, expect, it } from "vitest";
import { bumpOracleFire, m2OracleGraph } from "./m2OracleGraph.js";

describe("m2OracleGraph fixture", () => {
  it("wires audio → loom → oracle → caption and keeps seraph OUT", () => {
    const types = new Map(m2OracleGraph.nodes.map((n) => [n.id, n.type]));
    expect(types.get("loom1")).toBe("GEN/PromptLoom");
    expect(types.get("oracle1")).toBe("GEN/Oracle");
    expect(types.get("caption1")).toBe("LIT/Caption");
    expect(types.get("out1")).toBe("OUT/Render");

    const wireKeys = m2OracleGraph.wires.map(
      (w) => `${w.from.opId}.${w.from.port}→${w.to.opId}.${w.to.port}`,
    );
    expect(wireKeys).toContain("audio1.bandLow→loom1.lux");
    expect(wireKeys).toContain("loom1.text→oracle1.prompt");
    expect(wireKeys).toContain("oracle1.text→caption1.text");
    expect(wireKeys).toContain("pc1.geometry→out1.geometry");
  });

  it("routes the spoken antiphon to the OUT/AudioOut master bus", () => {
    const types = new Map(m2OracleGraph.nodes.map((n) => [n.id, n.type]));
    expect(types.get("antiphon1")).toBe("GEN/Antiphon");
    expect(types.get("audioout1")).toBe("OUT/AudioOut");

    const wireKeys = m2OracleGraph.wires.map(
      (w) => `${w.from.opId}.${w.from.port}→${w.to.opId}.${w.to.port}`,
    );
    expect(wireKeys).toContain("oracle1.text→antiphon1.text");
    expect(wireKeys).toContain("oracle1.complete→antiphon1.event");
    // Without this wire no OUT sink pulls Antiphon and it never cooks.
    expect(wireKeys).toContain("antiphon1.media→audioout1.media");
  });

  it("names a speech-capable provider explicitly, not the empty fallback", () => {
    // Empty would resolve to the first cap-matching instance — local-ollama,
    // which advertises speech.synthesize via openai-compat but cannot serve it.
    const antiphon = m2OracleGraph.nodes.find((n) => n.id === "antiphon1");
    expect(antiphon?.params.providerInstanceId).toBe("local-mock");
  });

  it("bumpOracleFire increments fire param", () => {
    const next = bumpOracleFire(m2OracleGraph);
    const o = next.nodes.find((n) => n.id === "oracle1");
    expect(o?.params.fire).toBe(1);
    expect(bumpOracleFire(next).nodes.find((n) => n.id === "oracle1")?.params.fire).toBe(
      2,
    );
  });
});
