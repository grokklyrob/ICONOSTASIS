/**
 * Grain pass — FX/Grain → OUT/Render (§8.2).
 * Animated film grain + optional scanline/phosphor mode.
 */

export type GrainMode = "film" | "scanline" | "phosphor";

export interface GrainPassState {
  kind: "grain";
  enabled: boolean;
  amount: number;
  /** Animation speed (cycles per second-ish). */
  speed: number;
  mode: GrainMode;
}

export function isGrainPassState(value: unknown): value is GrainPassState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GrainPassState).kind === "grain"
  );
}

export function createGrainPassState(
  partial: Partial<Omit<GrainPassState, "kind">> = {},
): GrainPassState {
  const mode = partial.mode;
  return {
    kind: "grain",
    enabled: partial.enabled ?? true,
    amount: partial.amount ?? 0.08,
    speed: partial.speed ?? 1,
    mode:
      mode === "scanline" || mode === "phosphor" || mode === "film"
        ? mode
        : "film",
  };
}
