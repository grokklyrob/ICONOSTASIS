/** MAT/Halo — additive rim/glow material (Appendix A). */

import type { MaterialHandle } from "../../materials/types.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";

export const MAT_HALO_TYPE = "MAT/Halo" as const;

export const haloFactory: OperatorFactory = {
  type: MAT_HALO_TYPE,
  family: "MAT",
  inputs: [],
  outputs: [{ id: "material", type: "material" }],
  params: [
    {
      id: "intensity",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "softness",
      type: "float",
      default: 0.5,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "color",
      type: "color",
      default: "#ffe6a0",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: MaterialHandle = {
      kind: "material",
      materialKind: "halo",
      params: {},
    };
    const instance: OperatorInstance = {
      id,
      type: MAT_HALO_TYPE,
      family: "MAT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "material") {
          throw new Error(`MAT/Halo: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "material",
          materialKind: "halo",
          params: {
            intensity: asFinite(ctx.getParam("intensity"), 1),
            softness: asFinite(ctx.getParam("softness"), 0.5),
            color: String(ctx.getParam("color") ?? "#ffe6a0"),
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
