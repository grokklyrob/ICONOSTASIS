/**
 * .icx pack/unpack + taint on pack (§12.2–§12.3).
 */
import { describe, expect, it } from "vitest";
import { createDefaultManifest } from "./manifest.js";
import {
  packIcx,
  unpackIcx,
  verifyIcxAssetHashes,
  IcxError,
} from "./icx.js";
import { TaintGateError } from "./taintGate.js";
import { sha256Hex } from "./hash.js";

const sampleGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "pc1",
      type: "GEO/PointCloud",
      params: { assetPath: "assets/seraph.bin" },
    },
  ],
  wires: [],
  modulations: [],
};

describe("packIcx / unpackIcx", () => {
  it("round-trips graph + asset with matching sha256", async () => {
    const assetBytes = new Uint8Array([0, 1, 2, 3, 9, 8, 7]);
    const hex = await sha256Hex(assetBytes);
    const packed = await packIcx({
      manifest: createDefaultManifest({
        title: "Test Piece",
        assets: [
          {
            path: "assets/seraph.bin",
            sha256: hex,
            type: "pointcloud/bin",
            points: 7,
          },
        ],
      }),
      graph: sampleGraph,
      story: { schemaVersion: 1, stations: [{ id: "s1" }] },
      assets: [{ path: "assets/seraph.bin", bytes: assetBytes }],
      thumbnail: new Uint8Array([137, 80, 78, 71]), // png magic-ish
    });

    expect(packed.byteLength).toBeGreaterThan(32);

    const project = unpackIcx(packed);
    expect(project.manifest.title).toBe("Test Piece");
    expect(project.graph).toMatchObject(sampleGraph);
    expect(project.story).toMatchObject({ stations: [{ id: "s1" }] });
    expect(project.assets).toHaveLength(1);
    expect(project.assets[0]?.bytes).toEqual(assetBytes);
    expect(project.thumbnail?.byteLength).toBe(4);

    const bad = await verifyIcxAssetHashes(project);
    expect(bad).toEqual([]);
  });

  it("computes missing asset hashes on pack", async () => {
    const assetBytes = new Uint8Array([10, 20, 30]);
    const packed = await packIcx({
      manifest: createDefaultManifest({
        assets: [{ path: "assets/a.bin", sha256: "" }],
      }),
      graph: sampleGraph,
      assets: [{ path: "a.bin", bytes: assetBytes }],
    });
    const project = unpackIcx(packed);
    const expected = await sha256Hex(assetBytes);
    expect(project.manifest.assets[0]?.sha256).toBe(expected);
  });

  it("blocks pack when graph embeds a provider key", async () => {
    await expect(
      packIcx({
        manifest: createDefaultManifest(),
        graph: {
          schemaVersion: 1,
          nodes: [
            {
              id: "bad",
              type: "LIT/Caption",
              params: {
                text: "sk-abcdefghijklmnopqrstuvwxyz012345",
              },
            },
          ],
          wires: [],
          modulations: [],
        },
        assets: [],
      }),
    ).rejects.toBeInstanceOf(TaintGateError);
  });

  it("blocks pack on vault secret leak", async () => {
    const vault = "vault-secret-value-abcdef";
    await expect(
      packIcx(
        {
          manifest: createDefaultManifest({ description: `x ${vault}` }),
          graph: sampleGraph,
          assets: [],
        },
        { vaultSecrets: [vault] },
      ),
    ).rejects.toBeInstanceOf(TaintGateError);
  });

  it("throws on corrupt zip", () => {
    expect(() => unpackIcx(new Uint8Array([1, 2, 3]))).toThrow(IcxError);
  });
});
