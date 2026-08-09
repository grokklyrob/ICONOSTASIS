/**
 * Flash limiter — always on in the render path (AGENTS hard invariant 6, §16.4).
 *
 * M0 implements the **rise-rate damper** as real behavior: frame-to-frame mean
 * luminance proxy cannot jump faster than maxRisePerSecond.
 *
 * TODO(§16.4 / AMD-10 / AMD-24): M1 — full WCAG 2.3.1-oriented damper:
 *   - count whole-frame mean-luminance flashes over a rolling 1s window
 *   - suppress/damp contributions that would exceed 3 flashes/sec
 *   - document approximation (mean luma only; not full SC 2.3.1 certification)
 */

export interface FlashLimiterState {
  /** Previous frame's limited luminance proxy in [0, ∞). */
  prevLuma: number;
}

export interface FlashLimiterConfig {
  /**
   * Max allowed increase in luma proxy per second.
   * Default ~2.0 keeps processional motion but kills hard strobes.
   */
  maxRisePerSecond: number;
}

export const DEFAULT_FLASH_LIMITER_CONFIG: FlashLimiterConfig = {
  maxRisePerSecond: 2.0,
};

/**
 * Clamp rising luminance. Falls are unrestricted (darkening is safe).
 * @returns limited luma for this frame (also store as next prevLuma)
 */
export function applyRiseRateClamp(
  prevLuma: number,
  targetLuma: number,
  deltaSeconds: number,
  config: FlashLimiterConfig = DEFAULT_FLASH_LIMITER_CONFIG,
): number {
  const prev = Math.max(0, Number.isFinite(prevLuma) ? prevLuma : 0);
  const target = Math.max(0, Number.isFinite(targetLuma) ? targetLuma : 0);
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);

  if (target <= prev) {
    return target;
  }

  const maxRise = Math.max(0, config.maxRisePerSecond) * dt;
  if (dt === 0) {
    // Zero-dt frame: allow no rise (hold) to avoid divide-by-zero strobes.
    return prev;
  }
  return Math.min(target, prev + maxRise);
}

/**
 * Rough scene luminance proxy for M0 (no GPU readback).
 * Combines exposure and bloom strength so audio-modulated bloom is limited too.
 */
export function estimateLumaProxy(opts: {
  exposure: number;
  bloomStrength: number;
  hasGeometry: boolean;
  /**
   * A generated backdrop covers every pixel, so it is a flash risk on its own —
   * a dark scene swapping to a bright icon must be damped like any other rise.
   */
  hasBackdrop?: boolean;
}): number {
  const hasBackdrop = opts.hasBackdrop ?? false;
  if (!opts.hasGeometry && !hasBackdrop) return 0;
  const exp = Math.max(0, opts.exposure);
  const bloom = Math.max(0, opts.bloomStrength);
  // Base scene contribution + bloom tail; units are abstract [0, ∞).
  const geometry = opts.hasGeometry ? 0.35 + bloom * 0.25 : 0;
  const backdrop = hasBackdrop ? 0.4 : 0;
  return exp * (geometry + backdrop);
}

/**
 * Map limited luma back to an effective exposure scale relative to the target proxy.
 * If target is 0, returns 0.
 */
export function limitedExposureScale(
  targetLuma: number,
  limitedLuma: number,
): number {
  if (targetLuma <= 1e-8) return 0;
  return Math.max(0, Math.min(1, limitedLuma / targetLuma));
}
