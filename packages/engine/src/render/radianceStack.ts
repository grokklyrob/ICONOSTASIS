/**
 * Radiance Stack resolve — fixed order + tier auto-bypass (§8.2, §8.4).
 *
 * Order: Bloom → Godrays → ChromaticAberration → Grain → Vignette → ToneMap
 * (ToneMap is OUT/Render-owned; FX Feedback is separate catalog work).
 */

import { isRadiancePassEnabled, isBloomHalfRes } from "../tier/budgets.js";
import type { DeviceTier } from "../tier/types.js";
import type { BloomPassState } from "./bloomPass.js";
import type { ChromaticAberrationPassState } from "./chromaticAberrationPass.js";
import type { GodraysPassState } from "./godraysPass.js";
import type { GrainPassState } from "./grainPass.js";
import type { ToneMapCurve } from "./toneMap.js";
import type { VignettePassState } from "./vignettePass.js";

export interface RadianceStackInputs {
  bloom?: BloomPassState;
  godrays?: GodraysPassState;
  chromaticAberration?: ChromaticAberrationPassState;
  grain?: GrainPassState;
  vignette?: VignettePassState;
  toneMap: ToneMapCurve;
  /** When set, auto-bypass passes not allowed for the tier. */
  tier?: DeviceTier;
}

export interface EffectiveRadianceStack {
  bloom: BloomPassState | undefined;
  godrays: GodraysPassState | undefined;
  chromaticAberration: ChromaticAberrationPassState | undefined;
  grain: GrainPassState | undefined;
  vignette: VignettePassState | undefined;
  toneMap: ToneMapCurve;
  /** wayside bloom half-res (§8.4). */
  bloomHalfRes: boolean;
}

function passAllowed(
  tier: DeviceTier | undefined,
  pass: "bloom" | "godrays" | "chromaticAberration" | "grain" | "vignette",
): boolean {
  if (!tier) return true; // no probe → author graph wins (headless / M0 path)
  return isRadiancePassEnabled(tier, pass);
}

/**
 * Apply tier auto-bypass: disabled passes become enabled:false (or omitted).
 * Bloom gains halfRes when wayside.
 */
export function resolveRadianceStack(
  inputs: RadianceStackInputs,
): EffectiveRadianceStack {
  const tier = inputs.tier;
  const bloomHalfRes = tier ? isBloomHalfRes(tier) : false;

  let bloom = inputs.bloom;
  if (bloom && !passAllowed(tier, "bloom")) {
    bloom = { ...bloom, enabled: false };
  } else if (bloom && bloomHalfRes) {
    bloom = { ...bloom };
  }

  let godrays = inputs.godrays;
  if (godrays && !passAllowed(tier, "godrays")) {
    godrays = { ...godrays, enabled: false };
  }

  let chromaticAberration = inputs.chromaticAberration;
  if (chromaticAberration && !passAllowed(tier, "chromaticAberration")) {
    chromaticAberration = { ...chromaticAberration, enabled: false };
  }

  let grain = inputs.grain;
  if (grain && !passAllowed(tier, "grain")) {
    grain = { ...grain, enabled: false };
  }

  let vignette = inputs.vignette;
  if (vignette && !passAllowed(tier, "vignette")) {
    vignette = { ...vignette, enabled: false };
  }

  return {
    bloom,
    godrays,
    chromaticAberration,
    grain,
    vignette,
    toneMap: inputs.toneMap,
    bloomHalfRes,
  };
}
