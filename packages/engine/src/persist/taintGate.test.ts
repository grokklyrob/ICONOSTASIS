/**
 * Taint-gate red-team corpus (architecture.md §12.3, §19).
 */
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash.js";
import {
  advisoryHighEntropy,
  assertUntainted,
  scanForSecrets,
  TaintGateError,
} from "./taintGate.js";

describe("taintGate blocking detectors", () => {
  it("blocks OpenAI-style sk- keys in params", () => {
    const findings = scanForSecrets({
      nodes: [
        {
          id: "x",
          params: { apiKey: "sk-abcdefghijklmnopqrstuvwxyz012345" },
        },
      ],
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.reason).toMatch(/secret pattern/);
  });

  it("blocks sk-ant- keys", () => {
    const findings = scanForSecrets({
      prompt: "use sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    });
    expect(findings.length).toBeGreaterThan(0);
  });

  it("blocks keys hidden in captions and filenames", () => {
    expect(
      scanForSecrets({
        captions: ["Hello sk-abcdefghijklmnopqrstuvwxyz012345"],
      }).length,
    ).toBeGreaterThan(0);
    expect(
      scanForSecrets({
        assets: [{ path: "assets/sk-abcdefghijklmnopqrstuvwxyz012345.png" }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it("blocks exact vault secret equality", () => {
    const secret = "my-super-secret-session-token-xyz";
    const findings = scanForSecrets(
      { note: `leak ${secret} here` },
      { vaultSecrets: [secret] },
    );
    expect(findings.some((f) => f.reason.includes("vault"))).toBe(true);
  });

  it("assertUntainted throws TaintGateError", () => {
    expect(() =>
      assertUntainted({ k: "sk-abcdefghijklmnopqrstuvwxyz012345" }),
    ).toThrow(TaintGateError);
  });
});

describe("taintGate exemptions", () => {
  it("does not block sha256 hex digests on assets[].sha256", async () => {
    const hex = await sha256Hex("seraph-bytes");
    expect(() =>
      assertUntainted({
        assets: [{ path: "assets/seraph.bin", sha256: hex, type: "pointcloud/bin" }],
      }),
    ).not.toThrow();
  });

  it("does not block artifactHash / promptHash fields", async () => {
    const hex = await sha256Hex("prompt-body");
    expect(() =>
      assertUntainted({
        provenance: [
          {
            artifactHash: hex,
            promptHash: hex,
            capability: "text.stream",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("passes a conforming non-empty icx-like manifest with real hashes", async () => {
    const hex = await sha256Hex(new Uint8Array([1, 2, 3, 4]));
    expect(() =>
      assertUntainted({
        schemaVersion: 1,
        title: "Via Lucis",
        assets: [
          {
            path: "assets/seraph.bin",
            sha256: hex,
            type: "pointcloud/bin",
            points: 288000,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe("advisory high-entropy", () => {
  it("is non-blocking and ignores digests", async () => {
    const hex = await sha256Hex("x");
    expect(advisoryHighEntropy(hex).advisory).toBe(false);
    // Long random-looking string may advisory
    const r = advisoryHighEntropy(
      "aB3$kL9mN2pQ7rS1tU4vW8xY0zC5dE6fG",
    );
    expect(typeof r.score).toBe("number");
  });
});
