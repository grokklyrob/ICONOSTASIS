/**
 * Device tier types (architecture.md §8.4).
 * Shared by probe, point governor, GPU fade caps, and post auto-bypass.
 */

export type DeviceTier = "cathedral" | "chapel" | "wayside";

/** Render backend identity as a probe input — not a sufficient tier classifier. */
export type ProbeBackend = "webgl2" | "webgpu";

/**
 * FX passes in Radiance Stack order (§8.2).
 * ToneMap + flash limiter live on OUT/Render (Appendix A), not here.
 */
export type RadiancePassId =
  | "bloom"
  | "godrays"
  | "chromaticAberration"
  | "grain"
  | "vignette";

export interface RadiancePassPolicy {
  pass: RadiancePassId;
  /** wayside bloom half-res only (§8.4). */
  halfRes: boolean;
}

export interface TierBudgets {
  tier: DeviceTier;
  /** Scene-total point + particle budget (§8.4). */
  pointBudget: number;
  /** Frame target (fps); wayside is a floor, others are targets. */
  frameTargetFps: number;
  /** Enabled post passes for this tier (auto-bypass remainder). */
  post: readonly RadiancePassPolicy[];
}
