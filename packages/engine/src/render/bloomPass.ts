/**
 * Bloom pass descriptor published by FX/Bloom for OUT/Render (§8.2).
 * M0: config object only; GPU mip-chain lives in the render backend (Step 6).
 */

export interface BloomPassState {
  kind: "bloom";
  enabled: boolean;
  threshold: number;
  strength: number;
  radius: number;
  /** Set by Radiance Stack resolve for wayside half-res (§8.4). */
  halfRes?: boolean;
}

export function isBloomPassState(value: unknown): value is BloomPassState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as BloomPassState).kind === "bloom"
  );
}

export function createBloomPassState(
  partial: Partial<Omit<BloomPassState, "kind">> = {},
): BloomPassState {
  return {
    kind: "bloom",
    enabled: partial.enabled ?? true,
    threshold: partial.threshold ?? 0.62,
    strength: partial.strength ?? 1.8,
    radius: partial.radius ?? 0.85,
  };
}
