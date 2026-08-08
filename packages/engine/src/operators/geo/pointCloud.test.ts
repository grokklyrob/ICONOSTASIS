/**
 * GEO/PointCloud async arrival + decimation — colocated (AGENTS.md).
 */
import { describe, expect, it } from "vitest";
import { encodeSeraphBin } from "../../assets/seraphBin.js";
import { GraphEvaluator } from "../../cook/evaluator.js";
import { createGraph } from "../../graph/graph.js";
import { OperatorRegistry } from "../../registry/registry.js";
import type { OperatorInstance } from "../../types/operator.js";
import {
  GEO_POINT_CLOUD_TYPE,
  pointCloudFactory,
  type PointCloudAsyncView,
} from "./pointCloud.js";

function makeSinkFactory() {
  return {
    type: "Test/Sink",
    family: "OUT" as const,
    inputs: [{ id: "geometry", type: "geometry" as const }],
    outputs: [],
    params: [],
    create(id: string): OperatorInstance & { last: unknown } {
      let last: unknown;
      const instance: OperatorInstance & { last: unknown } = {
        id,
        type: "Test/Sink",
        family: "OUT",
        params: {},
        dirty: true,
        alwaysDirty: true,
        get last() {
          return last;
        },
        getOutput: () => undefined,
        cook(ctx) {
          last = ctx.getInput("geometry");
        },
        dispose() {},
        serialize: () => ({}),
      };
      return instance;
    },
  };
}

function fixtureBuffer(count = 10): ArrayBuffer {
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = i;
    colors[i * 3] = i;
  }
  return encodeSeraphBin({ count, positions, colors });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("GEO/PointCloud", () => {
  it("cook returns void (never a Promise)", () => {
    const op = pointCloudFactory.create("pc", {
      assetPath: "x.bin",
      maxPoints: 0,
      pointSize: 0.02,
      displacement: 0,
      displacementScale: 1,
      cacheScope: "station",
    });
    const result = op.cook({
      time: 0,
      delta: 0,
      frame: 0,
      getInput: () => undefined,
      getParam: (id) => {
        const p: Record<string, string | number> = {
          assetPath: "x.bin",
          maxPoints: 0,
          pointSize: 0.02,
          displacement: 0,
          displacementScale: 1,
          cacheScope: "station",
        };
        return p[id] ?? 0;
      },
      getBaseParam: () => undefined,
      setOutput: () => {},
      loadAsset: async () => fixtureBuffer(),
    });
    expect(result).toBeUndefined();
  });

  it("transitions idle → pending → fresh with a slow loader", async () => {
    const registry = new OperatorRegistry();
    registry.register(pointCloudFactory);
    registry.register(makeSinkFactory());

    let resolveLoad!: (buf: ArrayBuffer) => void;
    const loadPromise = new Promise<ArrayBuffer>((r) => {
      resolveLoad = r;
    });

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "pc",
          type: GEO_POINT_CLOUD_TYPE,
          params: { assetPath: "test.bin", maxPoints: 0 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "sink", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      loadAsset: async () => loadPromise,
    });

    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    const pc = graph.getInstance("pc") as OperatorInstance & {
      asyncView: PointCloudAsyncView;
    };
    expect(pc.asyncView.status).toBe("pending");
    expect(pc.asyncView.lastGoodValue).toBeUndefined();
    expect(pc.asyncView.loadStarted).toBe(true);

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: unknown;
    };
    expect(sink.last).toBeUndefined(); // empty cache: no draw

    resolveLoad(fixtureBuffer(5));
    await delay(0);
    await delay(0);

    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });
    expect(pc.asyncView.status).toBe("fresh");
    expect(pc.asyncView.lastGoodValue?.data.count).toBe(5);
    expect(sink.last).toMatchObject({ kind: "pointcloud" });
  });

  it("applies maxPoints decimation on load", async () => {
    const registry = new OperatorRegistry();
    registry.register(pointCloudFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "pc",
          type: GEO_POINT_CLOUD_TYPE,
          params: { assetPath: "test.bin", maxPoints: 3 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "sink", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      loadAsset: async () => fixtureBuffer(20),
    });

    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    await delay(0);
    await delay(0);
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });

    const pc = graph.getInstance("pc") as OperatorInstance & {
      asyncView: PointCloudAsyncView;
    };
    expect(pc.asyncView.lastGoodValue?.data.count).toBe(3);
  });

  it("retains lastGoodValue on load error", async () => {
    const registry = new OperatorRegistry();
    registry.register(pointCloudFactory);
    registry.register(makeSinkFactory());

    let call = 0;
    let rejectFail!: (err: Error) => void;
    const failPromise = new Promise<ArrayBuffer>((_resolve, reject) => {
      rejectFail = reject;
    });

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "pc",
          type: GEO_POINT_CLOUD_TYPE,
          params: { assetPath: "a.bin", maxPoints: 0 },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "sink", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      loadAsset: async (path) => {
        call += 1;
        if (path === "a.bin") return fixtureBuffer(4);
        return failPromise;
      },
    });

    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    await delay(0);
    await delay(0);
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });

    const pc = graph.getInstance("pc") as OperatorInstance & {
      asyncView: PointCloudAsyncView;
    };
    expect(pc.asyncView.status).toBe("fresh");
    expect(pc.asyncView.lastGoodValue?.data.count).toBe(4);

    // Change path to force reload that fails.
    pc.params["assetPath"] = "b.bin";
    pc.dirty = true;
    evaluator.tick({ time: 0.032, delta: 0.016, frame: 2 });
    expect(pc.asyncView.status).toBe("pending");

    rejectFail(new Error("network fail"));
    // Reject path: catch is microtask; drain then observe.
    await failPromise.then(
      () => undefined,
      () => undefined,
    );
    await delay(0);

    expect(pc.asyncView.status).toBe("error");
    expect(pc.asyncView.errorMessage).toMatch(/network fail/);
    expect(pc.asyncView.lastGoodValue?.data.count).toBe(4);
    expect(call).toBe(2);
  });

  it("publishes modulatable displacement on the geometry handle", async () => {
    const registry = new OperatorRegistry();
    registry.register(pointCloudFactory);
    registry.register(makeSinkFactory());

    const graph = createGraph({
      schemaVersion: 1,
      nodes: [
        {
          id: "pc",
          type: GEO_POINT_CLOUD_TYPE,
          params: {
            assetPath: "t.bin",
            maxPoints: 0,
            displacement: 0.1,
            displacementScale: 2,
          },
        },
        { id: "sink", type: "Test/Sink", params: {} },
      ],
      wires: [
        {
          id: "w1",
          from: { opId: "pc", port: "geometry" },
          to: { opId: "sink", port: "geometry" },
        },
      ],
      modulations: [],
    });

    const evaluator = new GraphEvaluator(graph, registry, {
      loadAsset: async () => fixtureBuffer(2),
    });
    evaluator.tick({ time: 0, delta: 0, frame: 0 });
    await delay(0);
    await delay(0);
    evaluator.tick({ time: 0.016, delta: 0.016, frame: 1 });

    const sink = graph.getInstance("sink") as OperatorInstance & {
      last: { displacement: number; pointSize: number };
    };
    expect(sink.last.displacement).toBeCloseTo(0.2, 5);
  });
});
