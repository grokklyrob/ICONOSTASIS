/**
 * seraph.bin parse + decimation tests.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decimatePoints } from "./decimate.js";
import {
  encodeSeraphBin,
  parseSeraphBin,
  SeraphBinParseError,
} from "./seraphBin.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoSeraph = resolve(here, "../../../../assets/seraph.bin");

describe("parseSeraphBin", () => {
  it("parses a tiny positions+colors fixture", () => {
    const buf = encodeSeraphBin({
      count: 2,
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      colors: new Uint8Array([10, 20, 30, 40, 50, 60]),
    });
    const data = parseSeraphBin(buf);
    expect(data.count).toBe(2);
    expect([...data.positions]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...(data.colors ?? [])]).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("parses positions-only", () => {
    const buf = encodeSeraphBin({
      count: 1,
      positions: new Float32Array([0.5, -0.25, 1]),
    });
    const data = parseSeraphBin(buf);
    expect(data.count).toBe(1);
    expect(data.colors).toBeUndefined();
    expect(data.positions[0]).toBeCloseTo(0.5, 5);
  });

  it("rejects truncated buffers", () => {
    const full = encodeSeraphBin({
      count: 2,
      positions: new Float32Array(6),
      colors: new Uint8Array(6),
    });
    const truncated = full.slice(0, 10);
    expect(() => parseSeraphBin(truncated)).toThrow(SeraphBinParseError);
  });

  it("parses the shipped assets/seraph.bin (288k pts)", () => {
    const bytes = readFileSync(repoSeraph);
    const data = parseSeraphBin(bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ));
    expect(data.count).toBe(288_000);
    expect(data.positions.length).toBe(288_000 * 3);
    expect(data.colors?.length).toBe(288_000 * 3);
    expect(Number.isFinite(data.positions[0])).toBe(true);
    expect(Number.isFinite(data.positions[1])).toBe(true);
    expect(Number.isFinite(data.positions[2])).toBe(true);
  });
});

describe("decimatePoints", () => {
  it("is identity when under budget", () => {
    const data = {
      count: 3,
      positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]),
      colors: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    };
    const out = decimatePoints(data, 10);
    expect(out).toBe(data);
  });

  it("stride-samples to maxPoints with aligned colors", () => {
    const count = 100;
    const positions = new Float32Array(count * 3);
    const colors = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = i;
      colors[i * 3] = i % 256;
    }
    const out = decimatePoints({ count, positions, colors }, 10);
    expect(out.count).toBe(10);
    expect(out.positions.length).toBe(30);
    expect(out.colors?.length).toBe(30);
    // First and last preserved by even spacing.
    expect(out.positions[0]).toBe(0);
    expect(out.positions[(10 - 1) * 3]).toBe(99);
    expect(out.colors![0]).toBe(0);
    expect(out.colors![(10 - 1) * 3]).toBe(99);
  });

  it("maxPoints <= 0 means unlimited", () => {
    const data = {
      count: 5,
      positions: new Float32Array(15),
    };
    expect(decimatePoints(data, 0).count).toBe(5);
    expect(decimatePoints(data, -1).count).toBe(5);
  });
});
