/**
 * Chromatic aberration pass — FX/ChromaticAberration → OUT/Render (§8.2).
 * Subtle RGB split, edge-weighted.
 */

export interface ChromaticAberrationPassState {
  kind: "chromaticAberration";
  enabled: boolean;
  /** RGB split amount (graph units; backend maps to UV offset). */
  amount: number;
  /** 0 = uniform, 1 = fully edge-weighted. */
  edgeWeight: number;
}

export function isChromaticAberrationPassState(
  value: unknown,
): value is ChromaticAberrationPassState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ChromaticAberrationPassState).kind === "chromaticAberration"
  );
}

export function createChromaticAberrationPassState(
  partial: Partial<Omit<ChromaticAberrationPassState, "kind">> = {},
): ChromaticAberrationPassState {
  return {
    kind: "chromaticAberration",
    enabled: partial.enabled ?? true,
    amount: partial.amount ?? 0.003,
    edgeWeight: partial.edgeWeight ?? 0.85,
  };
}
