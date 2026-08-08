/**
 * Net-31 non-GEN catalog registration (architecture.md Appendix A, §18 M1).
 */
import { describe, expect, it } from "vitest";
import { OperatorRegistry } from "../registry/registry.js";
import { registerM1Operators } from "./catalog.js";

const NET_31 = [
  // SRC 5
  "SRC/Time",
  "SRC/AudioIn",
  "SRC/Input",
  "SRC/MIDI",
  "SRC/Seed",
  // SIG 6
  "SIG/LFO",
  "SIG/Envelope",
  "SIG/Math",
  "SIG/Smooth",
  "SIG/Logic",
  "SIG/Noise",
  // GEO 6
  "GEO/PointCloud",
  "GEO/Primitive",
  "GEO/Instancer",
  "GEO/SDFField",
  "GEO/Particles",
  "GEO/Glyph",
  // MAT 4
  "MAT/PointsMaterial",
  "MAT/GoldLeafPBR",
  "MAT/Halo",
  "MAT/CustomShader",
  // FX 6
  "FX/Bloom",
  "FX/Godrays",
  "FX/ChromaticAberration",
  "FX/Grain",
  "FX/Vignette",
  "FX/Feedback",
  // LIT 2
  "LIT/Caption",
  "LIT/Choice",
  // OUT 2
  "OUT/Render",
  "OUT/AudioOut",
] as const;

describe("registerM1Operators net-31", () => {
  it("registers all 31 non-GEN catalog types plus TEST probe", () => {
    const reg = new OperatorRegistry();
    registerM1Operators(reg);
    for (const t of NET_31) {
      expect(reg.has(t), t).toBe(true);
    }
    expect(NET_31).toHaveLength(31);
    expect(reg.has("TEST/SyntheticAsync")).toBe(true);
    expect(reg.listTypes().length).toBe(32);
  });
});
