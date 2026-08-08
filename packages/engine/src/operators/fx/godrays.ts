/**
 * FX/Godrays — radial light shafts from monstrance point (§8.2, Appendix A).
 */

import {
  createGodraysPassState,
  type GodraysPassState,
} from "../../render/godraysPass.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "./paramUtils.js";

export const FX_GODRAYS_TYPE = "FX/Godrays" as const;

export const godraysFactory: OperatorFactory = {
  type: FX_GODRAYS_TYPE,
  family: "FX",
  inputs: [{ id: "field", type: "field", label: "in (optional)" }],
  outputs: [{ id: "field", type: "field", label: "godrays" }],
  params: [
    {
      id: "strength",
      type: "float",
      default: 0.45,
      min: 0,
      max: 2,
      modulatable: true,
      exposable: true,
    },
    {
      id: "decay",
      type: "float",
      default: 0.92,
      min: 0.5,
      max: 0.99,
      modulatable: true,
      exposable: true,
    },
    {
      id: "monstranceX",
      type: "float",
      default: 0.5,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "monstranceY",
      type: "float",
      default: 0.55,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "samples",
      type: "int",
      default: 32,
      min: 8,
      max: 64,
      modulatable: false,
      exposable: false,
    },
    {
      id: "enabled",
      type: "bool",
      default: true,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: GodraysPassState = createGodraysPassState();

    const instance: OperatorInstance = {
      id,
      type: FX_GODRAYS_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port !== "field") {
          throw new Error(`FX/Godrays: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx): void {
        last = createGodraysPassState({
          enabled: asBool(ctx.getParam("enabled")),
          strength: asFinite(ctx.getParam("strength"), 0.45),
          decay: asFinite(ctx.getParam("decay"), 0.92),
          monstranceX: asFinite(ctx.getParam("monstranceX"), 0.5),
          monstranceY: asFinite(ctx.getParam("monstranceY"), 0.55),
          samples: Math.floor(asFinite(ctx.getParam("samples"), 32)),
        });
        ctx.setOutput("field", last);
      },
      dispose(): void {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
