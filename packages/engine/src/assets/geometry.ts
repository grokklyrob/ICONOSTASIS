/**
 * Geometry handles emitted by GEO ops (M0: point clouds only).
 */

import type { SeraphBinData } from "./seraphBin.js";

export interface PointCloudGeometry {
  kind: "pointcloud";
  data: SeraphBinData;
  /** Effective draw params from last cook (modulatable on GEO/PointCloud). */
  pointSize: number;
  displacement: number;
}

export type GeometryHandle = PointCloudGeometry;

export function isPointCloudGeometry(
  value: unknown,
): value is PointCloudGeometry {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as PointCloudGeometry).kind === "pointcloud"
  );
}
