/**
 * Measured capability probe → device tier (architecture.md §8.4).
 *
 * Assigns tier from achieved frame time and feature support — not marketing
 * GPU labels. WebGPU vs WebGL2 is an input, not a sufficient classifier.
 * Float color-buffer support selects HDR intermediates vs LDR fallback; it
 * does not by itself assign tier.
 *
 * Pure / headless: hosts supply measured inputs (or forceTier for author preview).
 */

import { budgetsForTier } from "./budgets.js";
import type {
  DeviceTier,
  ProbeBackend,
  TierBudgets,
} from "./types.js";

export interface ProbeMeasurements {
  /**
   * Median frame time of the standard probe scene, in milliseconds.
   * Lower is stronger. 60fps ≈ 16.67ms; 30fps ≈ 33.33ms.
   */
  medianFrameMs: number;
  /** Active graphics backend during the probe. */
  backend: ProbeBackend;
  /**
   * Hard probe: EXT_color_buffer_float (or half-float equivalent) / WebGPU float targets.
   * Gates HDR intermediates — not tier alone (§8.1 / §8.4).
   */
  floatColorBuffer: boolean;
  /**
   * Author preview override — skips measurement classification when set (§8.4).
   */
  forceTier?: DeviceTier;
}

export interface ProbeResult {
  tier: DeviceTier;
  budgets: TierBudgets;
  /** True when float color buffers are available — HDR intermediate path. */
  hdrIntermediates: boolean;
  /** Measurements that produced this result (including forceTier if any). */
  measured: ProbeMeasurements;
  /** How tier was chosen (for diagnostics / UI). */
  reason: string;
}

/**
 * Classify device tier from probe measurements.
 *
 * Thresholds (documented for tests; not marketing labels):
 * - forceTier → that tier (author preview)
 * - medianFrameMs ≤ 14 → cathedral (clear 60fps headroom)
 * - medianFrameMs ≤ 18 and WebGPU → cathedral
 * - medianFrameMs ≤ 22 → chapel
 * - medianFrameMs ≤ 28 and WebGPU → chapel
 * - else → wayside
 */
export function classifyTier(m: ProbeMeasurements): DeviceTier {
  if (m.forceTier) return m.forceTier;

  const ms = Number.isFinite(m.medianFrameMs) ? m.medianFrameMs : Infinity;
  const webgpu = m.backend === "webgpu";

  if (ms <= 14) return "cathedral";
  if (ms <= 18 && webgpu) return "cathedral";
  if (ms <= 22) return "chapel";
  if (ms <= 28 && webgpu) return "chapel";
  return "wayside";
}

function reasonFor(m: ProbeMeasurements, tier: DeviceTier): string {
  if (m.forceTier) {
    return `author preview forceTier=${m.forceTier}`;
  }
  return `medianFrameMs=${m.medianFrameMs.toFixed(2)} backend=${m.backend} → ${tier}`;
}

/** Run the measured probe classifier and attach budgets + HDR flag. */
export function runCapabilityProbe(m: ProbeMeasurements): ProbeResult {
  const tier = classifyTier(m);
  return {
    tier,
    budgets: budgetsForTier(tier),
    hdrIntermediates: m.floatColorBuffer === true,
    measured: { ...m },
    reason: reasonFor(m, tier),
  };
}
