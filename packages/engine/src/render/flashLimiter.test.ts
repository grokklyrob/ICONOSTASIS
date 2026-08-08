/**
 * Rise-rate flash clamp — real always-on behavior (not a pass-through).
 */
import { describe, expect, it } from "vitest";
import {
  applyRiseRateClamp,
  estimateLumaProxy,
  limitedExposureScale,
} from "./flashLimiter.js";

describe("applyRiseRateClamp", () => {
  it("allows falls unrestricted", () => {
    expect(applyRiseRateClamp(1, 0.1, 1 / 60)).toBeCloseTo(0.1, 6);
  });

  it("limits rise to maxRisePerSecond * dt", () => {
    // maxRise 2.0 / s, dt = 0.1 → max +0.2
    const limited = applyRiseRateClamp(0, 10, 0.1, { maxRisePerSecond: 2 });
    expect(limited).toBeCloseTo(0.2, 6);
  });

  it("does not clamp when rise is within budget", () => {
    const limited = applyRiseRateClamp(0.5, 0.55, 0.1, {
      maxRisePerSecond: 2,
    });
    expect(limited).toBeCloseTo(0.55, 6);
  });

  it("holds on zero dt instead of passing a strobe jump", () => {
    expect(applyRiseRateClamp(0.1, 5, 0, { maxRisePerSecond: 2 })).toBeCloseTo(
      0.1,
      6,
    );
  });
});

describe("estimateLumaProxy / limitedExposureScale", () => {
  it("is zero without geometry", () => {
    expect(
      estimateLumaProxy({ exposure: 1, bloomStrength: 3, hasGeometry: false }),
    ).toBe(0);
  });

  it("scales exposure by limited/target ratio", () => {
    expect(limitedExposureScale(2, 1)).toBeCloseTo(0.5, 6);
    expect(limitedExposureScale(0, 0)).toBe(0);
  });
});
