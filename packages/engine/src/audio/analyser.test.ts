/**
 * Pure analyser helpers — headless (architecture.md §11.1).
 */
import { describe, expect, it } from "vitest";
import {
  bandEnergiesFromSpectrum,
  computeAnalyserLevels,
  hzToBin,
  logBandEdgesHz,
  peakFromTimeDomain,
  rmsFromTimeDomain,
  smoothToward,
} from "./analyser.js";

describe("logBandEdgesHz", () => {
  it("returns bandCount+1 edges spanning low to Nyquist", () => {
    const edges = logBandEdgesHz(4, 48_000);
    expect(edges).toHaveLength(5);
    expect(edges[0]).toBeLessThan(edges[1]!);
    expect(edges[4]!).toBeCloseTo(24_000, 5);
    expect(edges[0]!).toBeGreaterThanOrEqual(20);
  });
});

describe("bandEnergiesFromSpectrum", () => {
  it("puts energy only in the high band for a high-bin spike", () => {
    const bins = new Float32Array(1024);
    // Near-nyquist bin
    bins[1000] = 1;
    const bands = bandEnergiesFromSpectrum(bins, 48_000, 4);
    expect(bands).toHaveLength(4);
    const high = bands[3]!;
    const low = bands[0]!;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(0);
  });

  it("puts energy only in the low band for a low-bin spike", () => {
    const bins = new Float32Array(1024);
    bins[2] = 1;
    const bands = bandEnergiesFromSpectrum(bins, 48_000, 4);
    expect(bands[0]!).toBeGreaterThan(bands[3]!);
  });
});

describe("rms/peak", () => {
  it("computes RMS and peak from time domain", () => {
    const samples = new Float32Array([0, 1, 0, -1]);
    expect(rmsFromTimeDomain(samples)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(peakFromTimeDomain(samples)).toBe(1);
  });
});

describe("smoothToward", () => {
  it("lags a step input", () => {
    let y = 0;
    y = smoothToward(y, 1, 0.5); // a = 0.5 → y = 0.5
    expect(y).toBeCloseTo(0.5, 6);
    y = smoothToward(y, 1, 0.5);
    expect(y).toBeCloseTo(0.75, 6);
  });

  it("lag=1 freezes; lag=0 snaps", () => {
    expect(smoothToward(0.2, 1, 1)).toBeCloseTo(0.2, 6);
    expect(smoothToward(0.2, 1, 0)).toBeCloseTo(1, 6);
  });
});

describe("computeAnalyserLevels", () => {
  it("returns zeros when inactive or missing", () => {
    expect(computeAnalyserLevels(undefined).rms).toBe(0);
    expect(
      computeAnalyserLevels({ frequency: [1, 1], active: false }).rms,
    ).toBe(0);
  });

  it("uses frequency-only levels when timeDomain omitted", () => {
    const levels = computeAnalyserLevels({
      frequency: [0.5, 0.5, 0.5, 0.5],
      sampleRate: 48_000,
      active: true,
    });
    expect(levels.rms).toBeCloseTo(0.5, 5);
    expect(levels.peak).toBeCloseTo(0.5, 5);
  });
});

describe("hzToBin", () => {
  it("maps 0 Hz to bin 0 and nyquist to last bin", () => {
    expect(hzToBin(0, 1024, 48_000)).toBe(0);
    expect(hzToBin(24_000, 1024, 48_000)).toBe(1023);
  });
});
