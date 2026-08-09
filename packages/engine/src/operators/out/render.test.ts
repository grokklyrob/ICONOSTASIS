/**
 * OUT/Render + mock backend + flash rise-rate clamp — colocated (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import type { PointCloudGeometry } from "../../assets/geometry.js";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import type { GenFieldHandle } from "../../render/backdropField.js";
import { MockRenderBackend } from "../../render/backend.js";
import { estimateLumaProxy } from "../../render/flashLimiter.js";
import { runCapabilityProbe } from "../../tier/probe.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import { bloomFactory, FX_BLOOM_TYPE } from "../fx/bloom.js";
import { OUT_RENDER_TYPE, renderFactory } from "./render.js";

function makeGeom(count = 2): PointCloudGeometry {
  return {
    kind: "pointcloud",
    data: {
      count,
      positions: new Float32Array(count * 3),
      colors: new Uint8Array(count * 3),
    },
    pointSize: 0.02,
    displacement: 0,
  };
}

function makeGeomSourceFactory(geom: PointCloudGeometry | undefined) {
  return {
    type: "Test/Geom",
    family: "GEO" as const,
    inputs: [],
    outputs: [{ id: "geometry", type: "geometry" as const }],
    params: [],
    create(id: string): OperatorInstance {
      return {
        id,
        type: "Test/Geom",
        family: "GEO",
        params: {},
        dirty: true,
        alwaysDirty: true,
        getOutput: (p) => {
          if (p !== "geometry") throw new Error(p);
          return geom;
        },
        cook(ctx) {
          ctx.setOutput("geometry", geom);
        },
        dispose() {},
        serialize: () => ({}),
      };
    },
  };
}

function makeField(prompt: string): GenFieldHandle {
  return {
    kind: "gen-field",
    mime: "image/png",
    bytes: new ArrayBuffer(8),
    prompt,
  };
}

function makeFieldSourceFactory(field: GenFieldHandle | undefined) {
  return {
    type: "Test/Field",
    family: "GEN" as const,
    inputs: [],
    outputs: [{ id: "field", type: "field" as const }],
    params: [],
    create(id: string): OperatorInstance {
      return {
        id,
        type: "Test/Field",
        family: "GEN",
        params: {},
        dirty: true,
        alwaysDirty: true,
        getOutput: (p) => {
          if (p !== "field") throw new Error(p);
          return field;
        },
        cook(ctx) {
          ctx.setOutput("field", field);
        },
        dispose() {},
        serialize: () => ({}),
      };
    },
  };
}

describe("OUT/Render", () => {
  it("cook returns void", () => {
    const op = renderFactory.create("out", {
      fov: 50,
      exposure: 1,
      clearColor: "#0d0d14",
    });
    const result = op.cook({
      time: 0,
      delta: 1 / 60,
      frame: 0,
      getInput: () => undefined,
      getParam: (id) => {
        const p: Record<string, number | string> = {
          fov: 50,
          exposure: 1,
          clearColor: "#0d0d14",
        };
        return p[id] ?? 0;
      },
      getBaseParam: () => undefined,
      setOutput: () => {},
    });
    expect(result).toBeUndefined();
  });

  it("draws points via mock backend when geometry is present", () => {
    const backend = new MockRenderBackend();
    const geom = makeGeom(3);
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(geom));
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        { id: "out", type: OUT_RENDER_TYPE, params: { exposure: 1 } },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });
    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });

    expect(backend.frames).toHaveLength(1);
    expect(backend.lastFrame?.draws).toHaveLength(1);
    expect(backend.lastFrame?.draws[0]?.geometry.data.count).toBe(3);
    expect(backend.lastFrame?.clearColor).toBe("#0d0d14");
  });

  it("does not draw when geometry is empty (no lastGoodValue)", () => {
    const backend = new MockRenderBackend();
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(undefined));
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        { id: "out", type: OUT_RENDER_TYPE, params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });
    evaluator.tick({ time: 0, delta: 1 / 60, frame: 0 });

    expect(backend.lastFrame?.draws).toHaveLength(0);
  });

  it("applies bloom pass state from wired field input", () => {
    const backend = new MockRenderBackend();
    const geom = makeGeom(1);
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(geom));
    registry.register(bloomFactory);
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        {
          id: "bloom",
          type: FX_BLOOM_TYPE,
          params: { strength: 2.5, threshold: 0.5, radius: 1 },
        },
        { id: "out", type: OUT_RENDER_TYPE, params: { exposure: 1 } },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
        {
          id: "w2",
          from: { opId: "bloom", port: "field" },
          to: { opId: "out", port: "bloom" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });
    // Warm limiter with small delta so strength is not fully crushed.
    evaluator.tick({ time: 0, delta: 1, frame: 0 });

    expect(backend.lastFrame?.blooms.length).toBeGreaterThan(0);
    const b = backend.lastFrame?.blooms[0];
    expect(b?.enabled).toBe(true);
    // After rise-rate scale, strength may be reduced but still present.
    expect(b?.strength).toBeGreaterThan(0);
  });

  it("tier auto-bypass: wayside disables grain/godrays; keeps bloom halfRes", () => {
    const backend = new MockRenderBackend();
    const geom = makeGeom(1);
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(geom));
    registry.register(bloomFactory);
    registry.register(renderFactory);

    // Wire bloom only; inject other passes via a multi-out test source below.
    const multiFx = {
      type: "Test/MultiFx",
      family: "FX" as const,
      inputs: [],
      outputs: [
        { id: "bloom", type: "field" as const },
        { id: "godrays", type: "field" as const },
        { id: "grain", type: "field" as const },
      ],
      params: [],
      create(id: string): OperatorInstance {
        return {
          id,
          type: "Test/MultiFx",
          family: "FX",
          params: {},
          dirty: true,
          alwaysDirty: true,
          getOutput: () => undefined,
          cook(ctx) {
            ctx.setOutput("bloom", {
              kind: "bloom",
              enabled: true,
              threshold: 0.5,
              strength: 1.5,
              radius: 1,
            });
            ctx.setOutput("godrays", {
              kind: "godrays",
              enabled: true,
              strength: 0.5,
              decay: 0.9,
              monstranceX: 0.5,
              monstranceY: 0.5,
              samples: 16,
            });
            ctx.setOutput("grain", {
              kind: "grain",
              enabled: true,
              amount: 0.1,
              speed: 1,
              mode: "film",
            });
          },
          dispose() {},
          serialize: () => ({}),
        };
      },
    };
    registry.register(multiFx);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        { id: "fx", type: "Test/MultiFx", params: {} },
        {
          id: "out",
          type: OUT_RENDER_TYPE,
          params: { exposure: 1, toneMap: "goldLeaf" },
        },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
        {
          id: "w2",
          from: { opId: "fx", port: "bloom" },
          to: { opId: "out", port: "bloom" },
        },
        {
          id: "w3",
          from: { opId: "fx", port: "godrays" },
          to: { opId: "out", port: "godrays" },
        },
        {
          id: "w4",
          from: { opId: "fx", port: "grain" },
          to: { opId: "out", port: "grain" },
        },
      ],
      modulations: [],
    });

    const probe = runCapabilityProbe({
      medianFrameMs: 40,
      backend: "webgl2",
      floatColorBuffer: false,
      forceTier: "wayside",
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
      probeResult: probe,
    });
    evaluator.tick({ time: 0, delta: 1, frame: 0 });

    expect(backend.lastFrame?.blooms[0]?.enabled).toBe(true);
    expect(backend.lastFrame?.blooms[0]?.halfRes).toBe(true);
    expect(backend.lastFrame?.godrays).toHaveLength(0);
    expect(backend.lastFrame?.grains).toHaveLength(0);
    expect(backend.lastFrame?.toneMaps).toEqual(["goldLeaf"]);
  });

  it("passes a wired gen-field to the backend as a backdrop", () => {
    const backend = new MockRenderBackend();
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(makeGeom(1)));
    registry.register(makeFieldSourceFactory(makeField("a gold-ground seraph")));
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        { id: "icon", type: "Test/Field", params: {} },
        { id: "out", type: OUT_RENDER_TYPE, params: { exposure: 1 } },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
        {
          id: "w2",
          from: { opId: "icon", port: "field" },
          to: { opId: "out", port: "backdrop" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });
    evaluator.tick({ time: 0, delta: 1, frame: 0 });

    expect(backend.lastFrame?.backdrops).toHaveLength(1);
    expect(backend.lastFrame?.backdrops[0]?.prompt).toBe(
      "a gold-ground seraph",
    );
  });

  it("clears the backdrop every frame when nothing is wired", () => {
    const backend = new MockRenderBackend();
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(makeGeom(1)));
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        { id: "out", type: OUT_RENDER_TYPE, params: { exposure: 1 } },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });
    evaluator.tick({ time: 0, delta: 1, frame: 0 });

    // Called with undefined, not skipped — the backend needs the fade-out cue.
    expect(backend.lastFrame?.backdrops).toEqual([undefined]);
  });

  it("counts a backdrop toward the flash limiter with no geometry present", () => {
    // A full-frame image is the whole frame's luminance. Without this the proxy
    // returns 0 and a black→bright-icon swap would be entirely undamped.
    const dark = estimateLumaProxy({
      exposure: 1,
      bloomStrength: 0,
      hasGeometry: false,
    });
    const withBackdrop = estimateLumaProxy({
      exposure: 1,
      bloomStrength: 0,
      hasGeometry: false,
      hasBackdrop: true,
    });

    expect(dark).toBe(0);
    expect(withBackdrop).toBeGreaterThan(0);

    // Geometry-only behaviour is unchanged (M0 callers pass no hasBackdrop).
    expect(
      estimateLumaProxy({ exposure: 1, bloomStrength: 0, hasGeometry: true }),
    ).toBeCloseTo(0.35);
  });

  it("rise-rate flash limiter actually damps a sudden exposure jump", () => {
    const backend = new MockRenderBackend();
    const geom = makeGeom(1);
    const registry = new OperatorRegistry();
    registry.register(makeGeomSourceFactory(geom));
    registry.register(renderFactory);

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        { id: "pc", type: "Test/Geom", params: {} },
        {
          id: "out",
          type: OUT_RENDER_TYPE,
          params: { exposure: 0.1 },
        },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "out", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      renderBackend: backend,
    });

    // Frame 0: settle at low exposure.
    evaluator.tick({ time: 0, delta: 1, frame: 0 });
    const e0 = backend.lastFrame?.draws[0]?.exposure ?? 0;
    expect(e0).toBeGreaterThan(0);

    // Jump exposure hard with tiny dt — rise-rate must clamp.
    graph.getInstance("out").params["exposure"] = 4;
    evaluator.tick({ time: 1 / 60, delta: 1 / 60, frame: 1 });
    const e1 = backend.lastFrame?.draws[0]?.exposure ?? 0;

    // Unclamped would be ~4; clamped rise is small.
    expect(e1).toBeLessThan(1);
    expect(e1).toBeGreaterThan(e0 * 0.5); // some increase allowed
  });
});
