/** GEO/Instancer — instance transforms over source geometry (Appendix A). */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";

export const GEO_INSTANCER_TYPE = "GEO/Instancer" as const;

export interface InstancerGeometry {
  kind: "instancer";
  source: unknown;
  count: number;
  spread: number;
  seed: number;
}

export const instancerFactory: OperatorFactory = {
  type: GEO_INSTANCER_TYPE,
  family: "GEO",
  inputs: [{ id: "geometry", type: "geometry" }],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "count",
      type: "int",
      default: 16,
      min: 1,
      max: 100_000,
      modulatable: true,
      exposable: true,
    },
    {
      id: "spread",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "seed",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: InstancerGeometry = {
      kind: "instancer",
      source: undefined,
      count: 16,
      spread: 1,
      seed: 0,
    };
    const instance: OperatorInstance = {
      id,
      type: GEO_INSTANCER_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "geometry") {
          throw new Error(`GEO/Instancer: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "instancer",
          source: ctx.getInput("geometry"),
          count: Math.max(1, Math.floor(asFinite(ctx.getParam("count"), 16))),
          spread: asFinite(ctx.getParam("spread"), 1),
          seed: asFinite(ctx.getParam("seed"), 0),
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
