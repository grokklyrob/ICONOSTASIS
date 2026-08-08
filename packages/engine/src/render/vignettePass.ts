/**
 * Vignette pass — FX/Vignette → OUT/Render (§8.2).
 * Optional gold-tinted falloff.
 */

export interface VignettePassState {
  kind: "vignette";
  enabled: boolean;
  /** Darkness at edges (0–1). */
  darkness: number;
  /** Softness / offset of falloff. */
  offset: number;
  /** When true, edge tint leans gold (signature aesthetic). */
  goldTint: boolean;
}

export function isVignettePassState(value: unknown): value is VignettePassState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as VignettePassState).kind === "vignette"
  );
}

export function createVignettePassState(
  partial: Partial<Omit<VignettePassState, "kind">> = {},
): VignettePassState {
  return {
    kind: "vignette",
    enabled: partial.enabled ?? true,
    darkness: partial.darkness ?? 0.55,
    offset: partial.offset ?? 0.35,
    goldTint: partial.goldTint ?? true,
  };
}
