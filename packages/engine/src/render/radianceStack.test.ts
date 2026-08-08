import { describe, expect, it } from "vitest";
import { createBloomPassState } from "./bloomPass.js";
import { createChromaticAberrationPassState } from "./chromaticAberrationPass.js";
import { createGodraysPassState } from "./godraysPass.js";
import { createGrainPassState } from "./grainPass.js";
import { createVignettePassState } from "./vignettePass.js";
import { resolveRadianceStack } from "./radianceStack.js";

describe("resolveRadianceStack", () => {
  it("leaves all passes when no tier (M0 headless path)", () => {
    const stack = resolveRadianceStack({
      bloom: createBloomPassState({ enabled: true }),
      godrays: createGodraysPassState({ enabled: true }),
      chromaticAberration: createChromaticAberrationPassState({
        enabled: true,
      }),
      grain: createGrainPassState({ enabled: true }),
      vignette: createVignettePassState({ enabled: true }),
      toneMap: "aces",
    });
    expect(stack.bloom?.enabled).toBe(true);
    expect(stack.godrays?.enabled).toBe(true);
    expect(stack.chromaticAberration?.enabled).toBe(true);
    expect(stack.grain?.enabled).toBe(true);
    expect(stack.vignette?.enabled).toBe(true);
    expect(stack.bloomHalfRes).toBe(false);
  });

  it("wayside: bloom half-res only; bypass others", () => {
    const stack = resolveRadianceStack({
      bloom: createBloomPassState({ enabled: true }),
      godrays: createGodraysPassState({ enabled: true }),
      chromaticAberration: createChromaticAberrationPassState({
        enabled: true,
      }),
      grain: createGrainPassState({ enabled: true }),
      vignette: createVignettePassState({ enabled: true }),
      toneMap: "goldLeaf",
      tier: "wayside",
    });
    expect(stack.bloom?.enabled).toBe(true);
    expect(stack.bloomHalfRes).toBe(true);
    expect(stack.godrays?.enabled).toBe(false);
    expect(stack.chromaticAberration?.enabled).toBe(false);
    expect(stack.grain?.enabled).toBe(false);
    expect(stack.vignette?.enabled).toBe(false);
    expect(stack.toneMap).toBe("goldLeaf");
  });

  it("chapel: bloom+grain+vignette; no godrays/CA", () => {
    const stack = resolveRadianceStack({
      bloom: createBloomPassState({ enabled: true }),
      godrays: createGodraysPassState({ enabled: true }),
      chromaticAberration: createChromaticAberrationPassState({
        enabled: true,
      }),
      grain: createGrainPassState({ enabled: true }),
      vignette: createVignettePassState({ enabled: true }),
      toneMap: "aces",
      tier: "chapel",
    });
    expect(stack.bloom?.enabled).toBe(true);
    expect(stack.bloomHalfRes).toBe(false);
    expect(stack.godrays?.enabled).toBe(false);
    expect(stack.chromaticAberration?.enabled).toBe(false);
    expect(stack.grain?.enabled).toBe(true);
    expect(stack.vignette?.enabled).toBe(true);
  });

  it("cathedral: full stack", () => {
    const stack = resolveRadianceStack({
      bloom: createBloomPassState({ enabled: true }),
      godrays: createGodraysPassState({ enabled: true }),
      chromaticAberration: createChromaticAberrationPassState({
        enabled: true,
      }),
      grain: createGrainPassState({ enabled: true }),
      vignette: createVignettePassState({ enabled: true }),
      toneMap: "aces",
      tier: "cathedral",
    });
    expect(stack.bloom?.enabled).toBe(true);
    expect(stack.godrays?.enabled).toBe(true);
    expect(stack.chromaticAberration?.enabled).toBe(true);
    expect(stack.grain?.enabled).toBe(true);
    expect(stack.vignette?.enabled).toBe(true);
  });
});
