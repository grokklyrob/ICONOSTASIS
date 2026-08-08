/**
 * graph.json round-trip incl. unknown fields (§12.2) and modulation sugar (AMD-14).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph } from "./graph.js";
import {
  deserializeGraph,
  graphFromJson,
  graphToJson,
  graphsSemanticallyEqual,
  GraphSerializeError,
  serializeGraph,
} from "./serialize.js";
import type { GraphDocument } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "fixtures/m0-seraph.graph.json");

describe("graph serialize/deserialize", () => {
  it("round-trips the m0-seraph fixture", () => {
    const text = readFileSync(fixturePath, "utf8");
    const doc = graphFromJson(text);
    const again = graphFromJson(graphToJson(doc));
    expect(graphsSemanticallyEqual(doc, again)).toBe(true);
    expect(doc.nodes.map((n) => n.type).sort()).toEqual(
      [
        "FX/Bloom",
        "GEO/PointCloud",
        "OUT/Render",
        "SIG/LFO",
        "SRC/AudioIn",
        "SRC/Time",
      ].sort(),
    );
    expect(doc.modulations).toHaveLength(3);
    expect(doc.wires).toHaveLength(2);
    // Frozen ports
    expect(doc.wires.find((w) => w.id === "w_pc_geom")).toMatchObject({
      from: { opId: "pc1", port: "geometry" },
      to: { opId: "out1", port: "geometry" },
    });
  });

  it("preserves unknown fields on round-trip (§12.2)", () => {
    const raw = {
      schemaVersion: 1 as const,
      xCustomFuture: { a: 1, nested: true },
      nodes: [
        {
          id: "audio1",
          type: "SRC/AudioIn",
          params: {},
          debugColor: "#ff00ff",
          position: [0, 0] as [number, number],
        },
        {
          id: "out1",
          type: "OUT/Render",
          params: {},
        },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "audio1", port: "rms" },
          to: { opId: "out1", port: "geometry" },
          meta: { editor: true },
        },
      ],
      modulations: [
        {
          id: "m1",
          from: { opId: "audio1", port: "bandLow" },
          to: { opId: "out1", param: "exposure" },
          hint: "keep",
          map: { in: [0, 1] as [number, number], out: [0.5, 1.5] as [number, number] },
        },
      ],
    };

    const doc = deserializeGraph(raw);
    const out = serializeGraph(doc);

    expect(out["xCustomFuture"]).toEqual({ a: 1, nested: true });
    const node = (out["nodes"] as Array<Record<string, unknown>>).find(
      (n) => n["id"] === "audio1",
    );
    expect(node?.["debugColor"]).toBe("#ff00ff");
    const wire = (out["wires"] as Array<Record<string, unknown>>)[0];
    expect(wire?.["meta"]).toEqual({ editor: true });
    const mod = (out["modulations"] as Array<Record<string, unknown>>)[0];
    expect(mod?.["hint"]).toBe("keep");

    // Second hop still preserves.
    const again = deserializeGraph(out);
    expect(serializeGraph(again)["xCustomFuture"]).toEqual({
      a: 1,
      nested: true,
    });
  });

  it("normalizes Appendix B per-node modulations sugar into top-level edges", () => {
    const raw = {
      schemaVersion: 1 as const,
      nodes: [
        {
          id: "audio1",
          type: "SRC/AudioIn",
          params: {},
        },
        {
          id: "bloom1",
          type: "FX/Bloom",
          params: { threshold: 0.62, strength: 1.8, radius: 0.85 },
          // Appendix B sugar
          modulations: [
            {
              param: "strength",
              from: "audio1.bandHigh",
              map: { in: [0, 1], out: [1.2, 3.0] },
            },
          ],
        },
        { id: "out1", type: "OUT/Render", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "bloom1", port: "field" },
          to: { opId: "out1", port: "bloom" },
        },
      ],
      modulations: [],
    };

    const doc = deserializeGraph(raw);
    expect(doc.modulations).toHaveLength(1);
    expect(doc.modulations[0]).toMatchObject({
      from: { opId: "audio1", port: "bandHigh" },
      to: { opId: "bloom1", param: "strength" },
      map: { in: [0, 1], out: [1.2, 3.0] },
    });
    // Sugar stripped from node
    expect(doc.nodes.find((n) => n.id === "bloom1")?.["modulations"]).toBe(
      undefined,
    );

    // Canonical re-serialize has top-level only
    const out = serializeGraph(doc);
    const bloomNode = (out["nodes"] as Array<Record<string, unknown>>).find(
      (n) => n["id"] === "bloom1",
    );
    expect(bloomNode?.["modulations"]).toBeUndefined();
    expect(out["modulations"]).toHaveLength(1);
  });

  it("rejects wires to unknown op ids", () => {
    expect(() =>
      deserializeGraph({
        schemaVersion: 1,
        nodes: [{ id: "a", type: "SRC/Time", params: {} }],
        wires: [
          {
            id: "w1",
            from: { opId: "a", port: "time" },
            to: { opId: "missing", port: "geometry" },
          },
        ],
        modulations: [],
      }),
    ).toThrow(GraphSerializeError);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() =>
      deserializeGraph({
        schemaVersion: 99,
        nodes: [],
        wires: [],
        modulations: [],
      }),
    ).toThrow(/Invalid graph/);
  });

  it("createGraph accepts deserialized fixture", () => {
    const doc = graphFromJson(readFileSync(fixturePath, "utf8"));
    const graph = createGraph(doc);
    expect(graph.document.nodes).toHaveLength(6);
  });

  it("fixture is valid JSON with expected modulation maps", () => {
    const doc = graphFromJson(readFileSync(fixturePath, "utf8")) as GraphDocument;
    const disp = doc.modulations.find((m) => m.id === "m_band_disp");
    expect(disp?.map).toEqual({ in: [0, 1], out: [0, 0.15] });
    const bloom = doc.modulations.find((m) => m.id === "m_band_bloom");
    expect(bloom?.map).toEqual({ in: [0, 1], out: [1.0, 2.2] });
  });
});
