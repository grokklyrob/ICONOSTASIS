/**
 * Godrays pass descriptor — FX/Godrays → OUT/Render (§8.2).
 * Radial light shafts from a designated monstrance point.
 */

export interface GodraysPassState {
  kind: "godrays";
  enabled: boolean;
  /** Shaft intensity. */
  strength: number;
  /** Decay along ray (0–1). */
  decay: number;
  /** Monstrance point in NDC-ish [0,1] UV (center of shafts). */
  monstranceX: number;
  monstranceY: number;
  samples: number;
}

export function isGodraysPassState(value: unknown): value is GodraysPassState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GodraysPassState).kind === "godrays"
  );
}

export function createGodraysPassState(
  partial: Partial<Omit<GodraysPassState, "kind">> = {},
): GodraysPassState {
  return {
    kind: "godrays",
    enabled: partial.enabled ?? true,
    strength: partial.strength ?? 0.45,
    decay: partial.decay ?? 0.92,
    monstranceX: partial.monstranceX ?? 0.5,
    monstranceY: partial.monstranceY ?? 0.55,
    samples: partial.samples ?? 32,
  };
}
