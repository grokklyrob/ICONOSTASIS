import { describe, expect, it } from "vitest";
import { SessionVault } from "./vault.js";

describe("SessionVault §15.1", () => {
  it("stores secrets under opaque SecretRef only", () => {
    const vault = new SessionVault();
    const ref = vault.put("ollama-local", "sk-test-secret-value-12345");
    expect(ref.startsWith("sec_")).toBe(true);
    expect(vault.has(ref)).toBe(true);
    expect(vault.list()).toEqual([
      expect.objectContaining({ ref, label: "ollama-local" }),
    ]);
    // list never exposes raw secret
    expect(JSON.stringify(vault.list())).not.toContain("sk-test");
  });

  it("resolveForBoundary returns raw only by ref", () => {
    const vault = new SessionVault();
    const ref = vault.put("k", "raw-secret-abc");
    expect(vault.resolveForBoundary(ref)).toBe("raw-secret-abc");
  });

  it("rejects empty secrets", () => {
    const vault = new SessionVault();
    expect(() => vault.put("x", "")).toThrow(/empty/);
  });

  it("revoke and clear drop secrets", () => {
    const vault = new SessionVault();
    const a = vault.put("a", "secret-a-value");
    const b = vault.put("b", "secret-b-value");
    expect(vault.revoke(a)).toBe(true);
    expect(vault.has(a)).toBe(false);
    expect(vault.has(b)).toBe(true);
    vault.clear();
    expect(vault.size()).toBe(0);
  });

  it("allRawSecretsForTaint lists exact vault strings for §12.3", () => {
    const vault = new SessionVault();
    vault.put("one", "alpha-secret-zzzz");
    vault.put("two", "beta-secret-yyyy");
    const raw = vault.allRawSecretsForTaint();
    expect(raw).toContain("alpha-secret-zzzz");
    expect(raw).toContain("beta-secret-yyyy");
  });
});
