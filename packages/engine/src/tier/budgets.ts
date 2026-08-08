/**
 * Normative tier budgets (architecture.md §8.4 table).
 */

import type {
  DeviceTier,
  RadiancePassPolicy,
  TierBudgets,
} from "./types.js";

/** Scene-total point budgets (§8.4). */
export const POINT_BUDGET_BY_TIER: Readonly<Record<DeviceTier, number>> = {
  cathedral: 2_000_000,
  chapel: 600_000,
  wayside: 150_000,
};

export const FRAME_TARGET_FPS_BY_TIER: Readonly<Record<DeviceTier, number>> = {
  cathedral: 60,
  chapel: 60,
  wayside: 30,
};

/**
 * Post auto-bypass by tier (§8.4):
 * - cathedral: full Radiance Stack (FX)
 * - chapel: bloom + grain + vignette
 * - wayside: bloom half-res only
 */
export function radiancePostForTier(
  tier: DeviceTier,
): readonly RadiancePassPolicy[] {
  switch (tier) {
    case "cathedral":
      return [
        { pass: "bloom", halfRes: false },
        { pass: "godrays", halfRes: false },
        { pass: "chromaticAberration", halfRes: false },
        { pass: "grain", halfRes: false },
        { pass: "vignette", halfRes: false },
      ];
    case "chapel":
      return [
        { pass: "bloom", halfRes: false },
        { pass: "grain", halfRes: false },
        { pass: "vignette", halfRes: false },
      ];
    case "wayside":
      return [{ pass: "bloom", halfRes: true }];
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export function budgetsForTier(tier: DeviceTier): TierBudgets {
  return {
    tier,
    pointBudget: POINT_BUDGET_BY_TIER[tier],
    frameTargetFps: FRAME_TARGET_FPS_BY_TIER[tier],
    post: radiancePostForTier(tier),
  };
}

/** Whether an FX pass is enabled under the tier's auto-bypass policy. */
export function isRadiancePassEnabled(
  tier: DeviceTier,
  pass: RadiancePassPolicy["pass"],
): boolean {
  return radiancePostForTier(tier).some((p) => p.pass === pass);
}

export function isBloomHalfRes(tier: DeviceTier): boolean {
  const bloom = radiancePostForTier(tier).find((p) => p.pass === "bloom");
  return bloom?.halfRes === true;
}
