/**
 * FX/ChromaticAberration — subtle edge-weighted RGB split (§8.2, Appendix A).
 */

import {
  createChromaticAberrationPassState,
  type ChromaticAberrationPassState,
} from "../../render/chromaticAberrationPass.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "./paramUtils.js";

export const FX_CHROMATIC_ABERRATION_TYPE = "FX/ChromaticAberration" as const;

export const chromaticAberrationFactory: OperatorFactory = {
  type: FX_CHROMATIC_ABERRATION_TYPE,
  family: "FX",
  inputs: [{ id: "field", type: "field", label: "in (optional)" }],
  outputs: [{ id: "field", type: "field", label: "chromaticAberration" }],
  params: [
    {
      id: "amount",
      type: "float",
      default: 0.003,
      min: 0,
      max: 0.05,
      modulatable: true,
      exposable: true,
    },
    {
      id: "edgeWeight",
      type: "float",
      default: 0.85,
      min: 0,
      max: 1,
      modulatable: true,
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
    let last: ChromaticAberrationPassState =
      createChromaticAberrationPassState();

    const instance: OperatorInstance = {
      id,
      type: FX_CHROMATIC_ABERRATION_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port !== "field") {
          throw new Error(`FX/ChromaticAberration: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx): void {
        last = createChromaticAberrationPassState({
          enabled: asBool(ctx.getParam("enabled")),
          amount: asFinite(ctx.getParam("amount"), 0.003),
          edgeWeight: asFinite(ctx.getParam("edgeWeight"), 0.85),
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
