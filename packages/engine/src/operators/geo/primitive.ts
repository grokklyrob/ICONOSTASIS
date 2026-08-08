/**
 * GEO/Primitive — procedural geometry handle (sphere/box/plane/torus) (Appendix A).
 * CPU-side param bundle; GPU mesh build is backend/M1 assemble concern.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const GEO_PRIMITIVE_TYPE = "GEO/Primitive" as const;

export type PrimitiveShape = "sphere" | "box" | "plane" | "torus";

export interface PrimitiveGeometry {
  kind: "primitive";
  shape: PrimitiveShape;
  size: number;
  segments: number;
  /** Optional material binding id (wired later via Assemble). */
  material?: unknown;
}

export function isPrimitiveGeometry(v: unknown): v is PrimitiveGeometry {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as PrimitiveGeometry).kind === "primitive"
  );
}

export const primitiveFactory: OperatorFactory = {
  type: GEO_PRIMITIVE_TYPE,
  family: "GEO",
  inputs: [{ id: "material", type: "material" }],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "shape",
      type: "enum",
      default: "sphere",
      enumValues: ["sphere", "box", "plane", "torus"],
      modulatable: false,
      exposable: true,
    },
    {
      id: "size",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "segments",
      type: "int",
      default: 32,
      min: 3,
      max: 256,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: PrimitiveGeometry = {
      kind: "primitive",
      shape: "sphere",
      size: 1,
      segments: 32,
    };
    const instance: OperatorInstance = {
      id,
      type: GEO_PRIMITIVE_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "geometry") {
          throw new Error(`GEO/Primitive: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        const shapeRaw = asString(ctx.getParam("shape"), "sphere");
        const shape = (
          ["sphere", "box", "plane", "torus"] as const
        ).includes(shapeRaw as PrimitiveShape)
          ? (shapeRaw as PrimitiveShape)
          : "sphere";
        last = {
          kind: "primitive",
          shape,
          size: asFinite(ctx.getParam("size"), 1),
          segments: Math.floor(asFinite(ctx.getParam("segments"), 32)),
          material: ctx.getInput("material"),
        };
        ctx.setOutput("geometry", last);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
