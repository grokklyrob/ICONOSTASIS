/**
 * Pure FFT band split + energy helpers for SRC/AudioIn (§11.1).
 * No Web Audio dependency — headless-testable.
 */

import type { AudioFrameSnapshot } from "./types.js";

export const DEFAULT_BAND_COUNT = 4 as const;

export type BandEnergies = readonly [number, number, number, number];

export interface AnalyserLevels {
  rms: number;
  peak: number;
  /** low / mid-low / mid-high / high — log-spaced (§11.1). */
  bands: BandEnergies;
}

/**
 * Log-spaced band edges in Hz for N bands over [fMin, Nyquist].
 * Full spectrum coverage so every FFT bin falls in some band (§11.1).
 */
export function logBandEdgesHz(
  bandCount: number,
  sampleRate: number,
  fMin = 20,
): number[] {
  const nyquist = sampleRate / 2;
  const fMax = Math.max(nyquist, fMin * 2);
  const lo = Math.max(1, Math.min(fMin, fMax * 0.5));
  const edges: number[] = [];
  for (let i = 0; i <= bandCount; i++) {
    const t = i / bandCount;
    edges.push(lo * Math.pow(fMax / lo, t));
  }
  // Ensure the top edge reaches Nyquist exactly (float drift).
  edges[bandCount] = fMax;
  return edges;
}

/** Map Hz to bin index for a spectrum of `binCount` bins at `sampleRate`. */
export function hzToBin(hz: number, binCount: number, sampleRate: number): number {
  const nyquist = sampleRate / 2;
  if (nyquist <= 0 || binCount <= 0) return 0;
  const idx = Math.floor((hz / nyquist) * binCount);
  return Math.min(binCount - 1, Math.max(0, idx));
}

/**
 * Mean magnitude in each log-spaced band, normalized to [0, 1]
 * (assumes input bins already in [0, 1]).
 */
export function bandEnergiesFromSpectrum(
  frequency: ArrayLike<number>,
  sampleRate: number,
  bandCount: number = DEFAULT_BAND_COUNT,
): number[] {
  const binCount = frequency.length;
  if (binCount === 0) return Array.from({ length: bandCount }, () => 0);

  const edges = logBandEdgesHz(bandCount, sampleRate);
  const bands: number[] = [];

  for (let b = 0; b < bandCount; b++) {
    const startHz = edges[b] ?? 0;
    const endHz = edges[b + 1] ?? startHz;
    let i0 = hzToBin(startHz, binCount, sampleRate);
    let i1 = hzToBin(endHz, binCount, sampleRate);
    // Last band is inclusive of the top bin so Nyquist energy is not dropped.
    if (b === bandCount - 1) {
      i1 = binCount;
    } else if (i1 <= i0) {
      i1 = Math.min(binCount, i0 + 1);
    }

    let sum = 0;
    let n = 0;
    for (let i = i0; i < i1; i++) {
      const v = frequency[i] ?? 0;
      sum += v;
      n += 1;
    }
    bands.push(n > 0 ? sum / n : 0);
  }

  return bands;
}

/** RMS of time-domain samples in [-1, 1]. */
export function rmsFromTimeDomain(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i] ?? 0;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / n);
}

/** Peak absolute amplitude of time-domain samples. */
export function peakFromTimeDomain(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * Fallback RMS/peak from frequency bins when time-domain is absent:
 * RMS ≈ sqrt(mean(bin^2)), peak ≈ max(bin).
 */
export function levelsFromFrequencyOnly(
  frequency: ArrayLike<number>,
): { rms: number; peak: number } {
  const n = frequency.length;
  if (n === 0) return { rms: 0, peak: 0 };
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = frequency[i] ?? 0;
    sumSq += v * v;
    if (v > peak) peak = v;
  }
  return { rms: Math.sqrt(sumSq / n), peak };
}

/** One-pole smoother toward target: y += (1 - lag) * (x - y). lag in [0, 1]. */
export function smoothToward(
  current: number,
  target: number,
  lag: number,
): number {
  const a = 1 - clamp01(lag);
  return current + a * (target - current);
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/**
 * Compute unsmoothed analyser levels from a frame snapshot.
 * Inactive / missing audio → zeros.
 */
export function computeAnalyserLevels(
  snapshot: AudioFrameSnapshot | undefined,
  bandCount: number = DEFAULT_BAND_COUNT,
): AnalyserLevels {
  const zeroBands = [0, 0, 0, 0] as unknown as BandEnergies;
  if (!snapshot || snapshot.active === false) {
    return { rms: 0, peak: 0, bands: zeroBands };
  }

  const frequency = snapshot.frequency;
  if (!frequency || frequency.length === 0) {
    return { rms: 0, peak: 0, bands: zeroBands };
  }

  const sampleRate = snapshot.sampleRate ?? 48_000;
  const bandsRaw = bandEnergiesFromSpectrum(frequency, sampleRate, bandCount);
  // Pad / trim to 4 for the M0 fixed port layout when bandCount differs.
  const bands = [
    bandsRaw[0] ?? 0,
    bandsRaw[1] ?? 0,
    bandsRaw[2] ?? 0,
    bandsRaw[3] ?? 0,
  ] as unknown as BandEnergies;

  if (snapshot.timeDomain && snapshot.timeDomain.length > 0) {
    return {
      rms: rmsFromTimeDomain(snapshot.timeDomain),
      peak: peakFromTimeDomain(snapshot.timeDomain),
      bands,
    };
  }

  const { rms, peak } = levelsFromFrequencyOnly(frequency);
  return { rms, peak, bands };
}
