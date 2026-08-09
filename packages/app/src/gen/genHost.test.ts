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
  it("seeds local-ollama provider without secrets", () => {
    const host = new GenHost();
    const inst = host.stack.registry.getInstance("local-ollama");
    expect(inst?.adapterId).toBe("openai-compat");
    expect(inst?.secretRef).toBeNull();
    expect(inst?.config.requireAuth).toBe(false);
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
