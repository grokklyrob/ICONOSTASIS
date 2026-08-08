/** MAT/GoldLeafPBR — signature gold metal material (Appendix A). */

import type { MaterialHandle } from "../../materials/types.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";

export const MAT_GOLD_LEAF_PBR_TYPE = "MAT/GoldLeafPBR" as const;

export const goldLeafPbrFactory: OperatorFactory = {
  type: MAT_GOLD_LEAF_PBR_TYPE,
  family: "MAT",
  inputs: [],
  outputs: [{ id: "material", type: "material" }],
  params: [
    {
      id: "metalness",
      type: "float",
      default: 0.9,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "roughness",
      type: "float",
      default: 0.35,
      min: 0,
      max: 1,
      modulatable: true,
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
      materialKind: "goldLeafPbr",
      params: {},
    };
    const instance: OperatorInstance = {
      id,
      type: MAT_GOLD_LEAF_PBR_TYPE,
      family: "MAT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "material") {
          throw new Error(`MAT/GoldLeafPBR: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "material",
          materialKind: "goldLeafPbr",
          params: {
            metalness: asFinite(ctx.getParam("metalness"), 0.9),
            roughness: asFinite(ctx.getParam("roughness"), 0.35),
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
