import { describe, expect, it } from "vitest";
import {
  budgetsForTier,
  FRAME_TARGET_FPS_BY_TIER,
  isBloomHalfRes,
  isRadiancePassEnabled,
  POINT_BUDGET_BY_TIER,
  radiancePostForTier,
} from "./budgets.js";

describe("§8.4 tier budgets", () => {
  it("matches normative point budgets", () => {
    expect(POINT_BUDGET_BY_TIER.cathedral).toBe(2_000_000);
    expect(POINT_BUDGET_BY_TIER.chapel).toBe(600_000);
    expect(POINT_BUDGET_BY_TIER.wayside).toBe(150_000);
  });

  it("matches frame targets", () => {
    expect(FRAME_TARGET_FPS_BY_TIER.cathedral).toBe(60);
    expect(FRAME_TARGET_FPS_BY_TIER.chapel).toBe(60);
    expect(FRAME_TARGET_FPS_BY_TIER.wayside).toBe(30);
  });

  it("cathedral enables full FX stack", () => {
    const posts = radiancePostForTier("cathedral").map((p) => p.pass);
    expect(posts).toEqual([
      "bloom",
      "godrays",
      "chromaticAberration",
      "grain",
      "vignette",
    ]);
    expect(isBloomHalfRes("cathedral")).toBe(false);
  });

  it("chapel is bloom+grain+vignette", () => {
    const posts = radiancePostForTier("chapel").map((p) => p.pass);
    expect(posts).toEqual(["bloom", "grain", "vignette"]);
    expect(isRadiancePassEnabled("chapel", "godrays")).toBe(false);
  });

  it("wayside is bloom half-res only", () => {
    expect(radiancePostForTier("wayside")).toEqual([
      { pass: "bloom", halfRes: true },
    ]);
    expect(isBloomHalfRes("wayside")).toBe(true);
    expect(isRadiancePassEnabled("wayside", "grain")).toBe(false);
  });

  it("budgetsForTier packages consistently", () => {
    const b = budgetsForTier("chapel");
    expect(b.tier).toBe("chapel");
    expect(b.pointBudget).toBe(600_000);
    expect(b.frameTargetFps).toBe(60);
    expect(b.post.length).toBe(3);
  });
});
