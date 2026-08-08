/**
 * MAT/PointsMaterial — point sprite material params (Appendix A).
 */

import {
  isMaterialHandle,
  type MaterialHandle,
} from "../../materials/types.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "../shared/paramUtils.js";

export const MAT_POINTS_MATERIAL_TYPE = "MAT/PointsMaterial" as const;

export const pointsMaterialFactory: OperatorFactory = {
  type: MAT_POINTS_MATERIAL_TYPE,
  family: "MAT",
  inputs: [],
  outputs: [{ id: "material", type: "material" }],
  params: [
    {
      id: "size",
      type: "float",
      default: 0.02,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "opacity",
      type: "float",
      default: 1,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "additive",
      type: "bool",
      default: true,
      modulatable: false,
      exposable: true,
    },
    {
      id: "color",
      type: "color",
      default: "#d4a84b",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: MaterialHandle = {
      kind: "material",
      materialKind: "points",
      params: {},
    };
    const instance: OperatorInstance = {
      id,
      type: MAT_POINTS_MATERIAL_TYPE,
      family: "MAT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "material") {
          throw new Error(`MAT/PointsMaterial: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "material",
          materialKind: "points",
          params: {
            size: asFinite(ctx.getParam("size"), 0.02),
            opacity: asFinite(ctx.getParam("opacity"), 1),
            additive: asBool(ctx.getParam("additive"), true),
            color: String(ctx.getParam("color") ?? "#d4a84b"),
          },
        };
        ctx.setOutput("material", last);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};

void isMaterialHandle;
