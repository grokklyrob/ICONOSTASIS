import { describe, expect, it } from "vitest";
import { classifyTier, runCapabilityProbe } from "./probe.js";

describe("classifyTier", () => {
  it("honors forceTier for author preview", () => {
    expect(
      classifyTier({
        medianFrameMs: 50,
        backend: "webgl2",
        floatColorBuffer: false,
        forceTier: "cathedral",
      }),
    ).toBe("cathedral");
  });

  it("cathedral on clear headroom", () => {
    expect(
      classifyTier({
        medianFrameMs: 12,
        backend: "webgl2",
        floatColorBuffer: false,
      }),
    ).toBe("cathedral");
  });

  it("WebGPU alone is not sufficient — slow frames stay wayside", () => {
    expect(
      classifyTier({
        medianFrameMs: 40,
        backend: "webgpu",
        floatColorBuffer: true,
      }),
    ).toBe("wayside");
  });

  it("WebGPU can lift borderline frames into cathedral", () => {
    expect(
      classifyTier({
        medianFrameMs: 16,
        backend: "webgpu",
        floatColorBuffer: true,
      }),
    ).toBe("cathedral");
    expect(
      classifyTier({
        medianFrameMs: 16,
        backend: "webgl2",
        floatColorBuffer: true,
      }),
    ).toBe("chapel");
  });

  it("mid frames are chapel; weak are wayside", () => {
    expect(
      classifyTier({
        medianFrameMs: 20,
        backend: "webgl2",
        floatColorBuffer: false,
      }),
    ).toBe("chapel");
    expect(
      classifyTier({
        medianFrameMs: 35,
        backend: "webgl2",
        floatColorBuffer: false,
      }),
    ).toBe("wayside");
  });
});

describe("runCapabilityProbe", () => {
  it("attaches budgets and HDR flag from floatColorBuffer (not tier)", () => {
    const slowHdr = runCapabilityProbe({
      medianFrameMs: 40,
      backend: "webgl2",
      floatColorBuffer: true,
    });
    expect(slowHdr.tier).toBe("wayside");
    expect(slowHdr.hdrIntermediates).toBe(true);
    expect(slowHdr.budgets.pointBudget).toBe(150_000);

    const fastLdr = runCapabilityProbe({
      medianFrameMs: 10,
      backend: "webgl2",
      floatColorBuffer: false,
    });
    expect(fastLdr.tier).toBe("cathedral");
    expect(fastLdr.hdrIntermediates).toBe(false);
    expect(fastLdr.budgets.pointBudget).toBe(2_000_000);
  });
});
