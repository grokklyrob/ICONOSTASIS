/**
 * GEO/PointCloud — async .bin loader (§7.1 Async Arrival Law, §8.3, Appendix A).
 * cook(ctx): void — schedules load; never returns a Promise (AMD-01).
 */

import { decimatePoints } from "../../assets/decimate.js";
import type { GeometryHandle } from "../../assets/geometry.js";
import { parseSeraphBin } from "../../assets/seraphBin.js";
import type { AsyncPortState, AsyncStatus, Presentation } from "../../types/ports.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const GEO_POINT_CLOUD_TYPE = "GEO/PointCloud" as const;

export type CacheScope = "station" | "global";

export interface PointCloudAsyncView {
  status: AsyncStatus;
  presentation: Presentation;
  lastGoodValue: GeometryHandle | undefined;
  errorMessage?: string;
  /** True while a load has been scheduled and not yet settled. */
  loadStarted: boolean;
  /** Points granted by the scene governor on last settle (if any). */
  grantedPoints?: number;
}

function cacheKey(
  assetPath: string,
  maxPoints: number,
  cacheScope: CacheScope,
  stationId: string | undefined,
  /** Governor budget fingerprint so tier/budget changes reload. */
  governorBudget: number | "none",
): string {
  const scopePart =
    cacheScope === "global" ? "global" : `station:${stationId ?? "default"}`;
  return `${scopePart}|${assetPath}|max:${maxPoints}|gov:${governorBudget}`;
}

export const pointCloudFactory: OperatorFactory = {
  type: GEO_POINT_CLOUD_TYPE,
  family: "GEO",
  inputs: [],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "assetPath",
      type: "string",
      default: "assets/seraph.bin",
      modulatable: false,
      exposable: false,
    },
    {
      id: "maxPoints",
      type: "int",
      default: 0, // 0 = unlimited (full asset)
      min: 0,
      modulatable: false,
      exposable: true,
    },
    {
      id: "pointSize",
      type: "float",
      default: 0.02,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "displacement",
      type: "float",
      default: 0,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "displacementScale",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "cacheScope",
      type: "enum",
      default: "station",
      enumValues: ["station", "global"],
      modulatable: false,
      exposable: false,
    },
  ],
  create(id, params): OperatorInstance & { asyncView: PointCloudAsyncView } {
    const asyncState: AsyncPortState<GeometryHandle> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };

    let loadStarted = false;
    let inflightKey: string | undefined;
    let settledKey: string | undefined;
    let grantedPoints: number | undefined;
    /** Pending geometry after reload while holding lastGoodValue (hold-then-swap). */
    let pendingGeometry: GeometryHandle | undefined;
    /** Last governor instance we leased against (for dispose release). */
    let leasedGovernor: { request: (id: string, n: number) => number; release: (id: string) => void } | undefined;

    const publishGeometry = (
      data: GeometryHandle["data"],
      pointSize: number,
      displacement: number,
    ): GeometryHandle => ({
      kind: "pointcloud",
      data,
      pointSize,
      displacement,
    });

    const instance: OperatorInstance & { asyncView: PointCloudAsyncView } = {
      id,
      type: GEO_POINT_CLOUD_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true, // displacement/pointSize may be modulated every frame
      get asyncView(): PointCloudAsyncView {
        return {
          status: asyncState.status,
          presentation: asyncState.presentation,
          lastGoodValue: asyncState.lastGoodValue,
          errorMessage: asyncState.errorMessage,
          loadStarted,
          grantedPoints,
        };
      },
      getOutput(port: string): unknown {
        if (port !== "geometry") {
          throw new Error(`GEO/PointCloud: unknown port "${port}"`);
        }
        // Empty cache → no draw (§7.1); present lastGoodValue when available.
        return asyncState.lastGoodValue;
      },
      cook(ctx): void {
        const assetPath = String(ctx.getParam("assetPath") ?? "");
        const maxPoints = Number(ctx.getParam("maxPoints") ?? 0);
        const pointSize = Number(ctx.getParam("pointSize") ?? 0.02);
        const displacementRaw = Number(ctx.getParam("displacement") ?? 0);
        const displacementScale = Number(
          ctx.getParam("displacementScale") ?? 1,
        );
        const displacement =
          (Number.isFinite(displacementRaw) ? displacementRaw : 0) *
          (Number.isFinite(displacementScale) ? displacementScale : 1);
        const cacheScope = (String(ctx.getParam("cacheScope") ?? "station") ===
        "global"
          ? "global"
          : "station") as CacheScope;

        const governor = ctx.pointGovernor;
        const govBudget = governor ? governor.budget : "none";
        const key = cacheKey(
          assetPath,
          maxPoints,
          cacheScope,
          undefined,
          govBudget,
        );

        // Update draw params on presented geometry without reloading.
        if (asyncState.lastGoodValue) {
          asyncState.lastGoodValue = {
            ...asyncState.lastGoodValue,
            pointSize: Number.isFinite(pointSize) ? pointSize : 0.02,
            displacement,
          };
        }

        // Schedule load when path/budget changes or never loaded.
        const needsLoad =
          assetPath.length > 0 &&
          settledKey !== key &&
          inflightKey !== key;

        if (needsLoad) {
          const loader = ctx.loadAsset;
          if (!loader) {
            asyncState.status = "error";
            asyncState.errorMessage =
              "GEO/PointCloud: no loadAsset host bound on CookContext";
            asyncState.presentation = "current";
          } else {
            loadStarted = true;
            inflightKey = key;
            asyncState.status = "pending";
            asyncState.errorMessage = undefined;
            // Keep lastGoodValue during pending (hold).

            // Schedule async I/O outside the cook return (AMD-01).
            void loader(assetPath)
              .then((buffer) => {
                if (inflightKey !== key) return; // superseded
                const parsed = parseSeraphBin(buffer);
                // Author maxPoints (0 = unlimited) ∩ asset count, then governor.
                const authorCap =
                  maxPoints > 0
                    ? Math.min(maxPoints, parsed.count)
                    : parsed.count;
                let target = authorCap;
                if (governor) {
                  leasedGovernor = governor;
                  target = governor.request(id, authorCap);
                }
                grantedPoints = target;
                const data = decimatePoints(parsed, target > 0 ? target : 0);
                // decimatePoints treats maxPoints<=0 as unlimited; empty grant → 0 pts.
                const finalData =
                  target <= 0
                    ? {
                        count: 0,
                        positions: new Float32Array(0),
                        colors: parsed.colors
                          ? new Uint8Array(0)
                          : undefined,
                      }
                    : data;
                const geom = publishGeometry(
                  finalData,
                  Number.isFinite(pointSize) ? pointSize : 0.02,
                  displacement,
                );

                if (asyncState.lastGoodValue) {
                  // Subsequent load: hold-then-swap (§7.1 geometry policy).
                  pendingGeometry = geom;
                  asyncState.status = "fresh";
                  asyncState.presentation = "queued";
                  // Atomic swap at end of this microtask window (M0: immediate swap after mark).
                  asyncState.lastGoodValue = pendingGeometry;
                  asyncState.presentation = "current";
                  pendingGeometry = undefined;
                } else {
                  // First arrival: set lastGoodValue (empty → value).
                  asyncState.lastGoodValue = geom;
                  asyncState.status = "fresh";
                  asyncState.presentation = "current";
                }
                settledKey = key;
                inflightKey = undefined;
                instance.dirty = true;
              })
              .catch((err: unknown) => {
                if (inflightKey !== key) return;
                asyncState.status = "error";
                asyncState.errorMessage =
                  err instanceof Error ? err.message : String(err);
                asyncState.presentation = "current";
                // lastGoodValue retained on error.
                inflightKey = undefined;
                instance.dirty = true;
              });
          }
        }

        ctx.setOutput("geometry", asyncState.lastGoodValue);
      },
      dispose(): void {
        leasedGovernor?.release(id);
        leasedGovernor = undefined;
        inflightKey = undefined;
        pendingGeometry = undefined;
        grantedPoints = undefined;
        asyncState.lastGoodValue = undefined;
        asyncState.status = "idle";
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
