/**
 * FX/Grain — animated film grain / scanline / phosphor (§8.2, Appendix A).
 */

import {
  createGrainPassState,
  type GrainMode,
  type GrainPassState,
} from "../../render/grainPass.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "./paramUtils.js";

export const FX_GRAIN_TYPE = "FX/Grain" as const;

function parseMode(raw: unknown): GrainMode {
  if (raw === "scanline" || raw === "phosphor" || raw === "film") return raw;
  return "film";
}

export const grainFactory: OperatorFactory = {
  type: FX_GRAIN_TYPE,
  family: "FX",
  inputs: [{ id: "field", type: "field", label: "in (optional)" }],
  outputs: [{ id: "field", type: "field", label: "grain" }],
  params: [
    {
      id: "amount",
      type: "float",
      default: 0.08,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "speed",
      type: "float",
      default: 1,
      min: 0,
      max: 8,
      modulatable: true,
      exposable: true,
    },
    {
      id: "mode",
      type: "enum",
      default: "film",
      enumValues: ["film", "scanline", "phosphor"],
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
    let last: GrainPassState = createGrainPassState();

    const instance: OperatorInstance = {
      id,
      type: FX_GRAIN_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port !== "field") {
          throw new Error(`FX/Grain: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx): void {
        last = createGrainPassState({
          enabled: asBool(ctx.getParam("enabled")),
          amount: asFinite(ctx.getParam("amount"), 0.08),
          speed: asFinite(ctx.getParam("speed"), 1),
          mode: parseMode(ctx.getParam("mode")),
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
