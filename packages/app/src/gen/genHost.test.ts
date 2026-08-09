/**
 * GenHost + engine taint bridge (M2a): vault secrets must block .icx pack.
 */

import {
  createDefaultManifest,
  packIcx,
  TaintGateError,
} from "@iconostasis/engine";
import { describe, expect, it } from "vitest";
import { GenHost } from "./genHost.js";

const minimalGraph = {
  schemaVersion: 1 as const,
  nodes: [
    {
      id: "t1",
      type: "SRC/Time",
      params: {},
      position: [0, 0] as [number, number],
    },
  ],
  wires: [],
  modulations: [],
};

describe("GenHost M2a bridge", () => {
  it("seeds the OpenRouter BYOK provider without secrets", () => {
    const host = new GenHost();
    const inst = host.stack.registry.getInstance("openrouter");
    expect(inst?.adapterId).toBe("openai-compat");
    // BYOK (§4.2): ships keyless and demands a key. The user supplies it.
    expect(inst?.secretRef).toBeNull();
    expect(inst?.config.requireAuth).toBe(true);
    expect(String(inst?.config.baseUrl)).toMatch(/^https:\/\//);
  });

  it("reports the BYOK default as unusable until a key is bound", () => {
    const host = new GenHost();
    // "" resolves to the first instance — the keyless BYOK default.
    expect(host.isProviderUsable("")).toBe(false);
    expect(host.isProviderUsable("openrouter")).toBe(false);
    // The keyless mock is usable precisely because it demands no key.
    expect(host.isProviderUsable("local-mock")).toBe(true);
    expect(host.isProviderUsable("nonexistent")).toBe(false);

    const ref = host.putSecret("openrouter", "sk-or-test-value-123456");
    host.bindSecretToProvider("openrouter", ref);
    expect(host.isProviderUsable("openrouter")).toBe(true);
    expect(host.isProviderUsable("")).toBe(true);
  });

  it("still accepts a local inference server (AMD-30 keeps §4.2 intact)", () => {
    // AMD-30 removed local inference from the M2 gate, not from the product.
    // openai-compat is generic, so a localhost baseUrl with no key must work —
    // if this ever fails, the amendment has quietly become a pillar change.
    const host = new GenHost();
    host.upsertProvider({
      id: "local-llm",
      adapterId: "openai-compat",
      label: "Local inference",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "smollm:135m",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });

    const inst = host.stack.registry.getInstance("local-llm");
    expect(inst?.config.requireAuth).toBe(false);
    expect(inst?.secretRef).toBeNull();
    expect(
      host.stack.registry.listInstances().map((i) => i.id),
    ).toContain("local-llm");
  });

  it("edit armed by default; perform disarmed", () => {
    const host = new GenHost();
    host.syncMode("edit");
    expect(host.stack.arming.isArmed()).toBe(true);
    host.syncMode("perform");
    expect(host.stack.arming.isArmed()).toBe(false);
    host.setGlobalArmed("perform", true);
    expect(host.stack.arming.isArmed()).toBe(true);
  });

  it("vault secrets feed packIcx taint gate and block leaks", async () => {
    const host = new GenHost();
    const secret = "sk-session-only-vault-secret-dddddddd";
    host.putSecret("leak-test", secret);

    await expect(
      packIcx(
        {
          manifest: createDefaultManifest({
            title: "taint",
            assets: [],
          }),
          graph: {
            ...minimalGraph,
            nodes: [
              {
                id: "t1",
                type: "SRC/Time",
                // Intentionally leak vault secret into graph (must block)
                params: { note: secret },
                position: [0, 0],
              },
            ],
          },
          story: { schemaVersion: 1, stations: [] },
          assets: [],
        },
        { vaultSecrets: host.vaultSecretsForTaint() },
      ),
    ).rejects.toBeInstanceOf(TaintGateError);
  });

  it("clean graph packs when vault holds secrets (no leak)", async () => {
    const host = new GenHost();
    host.putSecret("ok", "sk-clean-pack-secret-eeeeeeeeeeee");
    const bytes = await packIcx(
      {
        manifest: createDefaultManifest({ title: "ok", assets: [] }),
        graph: minimalGraph,
        story: { schemaVersion: 1, stations: [] },
        assets: [],
      },
      { vaultSecrets: host.vaultSecretsForTaint() },
    );
    expect(bytes.byteLength).toBeGreaterThan(32);
    // packed bytes must not contain raw secret
    const asText = new TextDecoder().decode(bytes);
    expect(asText).not.toContain("sk-clean-pack-secret");
  });
});
