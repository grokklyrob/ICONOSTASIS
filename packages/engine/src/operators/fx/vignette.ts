/**
 * FX/Vignette — edge falloff with optional gold tint (§8.2, Appendix A).
 */

import {
  createVignettePassState,
  type VignettePassState,
} from "../../render/vignettePass.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "./paramUtils.js";

export const FX_VIGNETTE_TYPE = "FX/Vignette" as const;

export const vignetteFactory: OperatorFactory = {
  type: FX_VIGNETTE_TYPE,
  family: "FX",
  inputs: [{ id: "field", type: "field", label: "in (optional)" }],
  outputs: [{ id: "field", type: "field", label: "vignette" }],
  params: [
    {
      id: "darkness",
      type: "float",
      default: 0.55,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "offset",
      type: "float",
      default: 0.35,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "goldTint",
      type: "bool",
      default: true,
      modulatable: false,
      exposable: true,
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
    let last: VignettePassState = createVignettePassState();

    const instance: OperatorInstance = {
      id,
      type: FX_VIGNETTE_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port !== "field") {
          throw new Error(`FX/Vignette: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx): void {
        last = createVignettePassState({
          enabled: asBool(ctx.getParam("enabled")),
          darkness: asFinite(ctx.getParam("darkness"), 0.55),
          offset: asFinite(ctx.getParam("offset"), 0.35),
          goldTint: asBool(ctx.getParam("goldTint"), true),
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
