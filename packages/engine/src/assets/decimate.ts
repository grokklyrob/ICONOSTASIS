/**
 * Point-cloud decimation hook (§8.4).
 * Loader-side stride sample; scene-total budget is PointGovernor.request → granted.
 */

import type { SeraphBinData } from "./seraphBin.js";

/**
 * Uniform stride sample down to at most maxPoints.
 * Deterministic; preserves positions/colors alignment.
 * Identity when count <= maxPoints or maxPoints <= 0 (0 = unlimited).
 */
export function decimatePoints(
  data: SeraphBinData,
  maxPoints: number,
): SeraphBinData {
  if (maxPoints <= 0 || data.count <= maxPoints) {
    return data;
  }
  if (maxPoints === 1) {
    return {
      count: 1,
      positions: data.positions.slice(0, 3),
      colors: data.colors ? data.colors.slice(0, 3) : undefined,
    };
  }

  const outCount = maxPoints;
  const positions = new Float32Array(outCount * 3);
  const colors = data.colors ? new Uint8Array(outCount * 3) : undefined;

  // Evenly spaced indices over [0, count).
  for (let i = 0; i < outCount; i++) {
    const src =
      outCount === 1
        ? 0
        : Math.min(
            data.count - 1,
            Math.floor((i * (data.count - 1)) / (outCount - 1)),
          );
    const so = src * 3;
    const oo = i * 3;
    positions[oo] = data.positions[so] ?? 0;
    positions[oo + 1] = data.positions[so + 1] ?? 0;
    positions[oo + 2] = data.positions[so + 2] ?? 0;
    if (colors && data.colors) {
      colors[oo] = data.colors[so] ?? 0;
      colors[oo + 1] = data.colors[so + 1] ?? 0;
      colors[oo + 2] = data.colors[so + 2] ?? 0;
    }
  }

  return { count: outCount, positions, colors };
}
