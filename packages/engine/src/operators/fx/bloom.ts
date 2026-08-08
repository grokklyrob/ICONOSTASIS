/**
 * FX/Bloom — modulatable post pass (§8.2, Appendix A, §18 M0).
 * Publishes BloomPassState on field output for OUT/Render to consume.
 */

import {
  createBloomPassState,
  type BloomPassState,
} from "../../render/bloomPass.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const FX_BLOOM_TYPE = "FX/Bloom" as const;

export const bloomFactory: OperatorFactory = {
  type: FX_BLOOM_TYPE,
  family: "FX",
  inputs: [
    // Optional upstream field for future Radiance Stack chaining (M1).
    { id: "field", type: "field", label: "in (optional)" },
  ],
  outputs: [{ id: "field", type: "field", label: "bloom" }],
  params: [
    {
      id: "threshold",
      type: "float",
      default: 0.62,
      min: 0,
      max: 2,
      modulatable: true,
      exposable: true,
    },
    {
      id: "strength",
      type: "float",
      default: 1.8,
      min: 0,
      max: 8,
      modulatable: true,
      exposable: true,
    },
    {
      id: "radius",
      type: "float",
      default: 0.85,
      min: 0,
      max: 4,
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
    let last: BloomPassState = createBloomPassState();

    const instance: OperatorInstance = {
      id,
      type: FX_BLOOM_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true, // params often modulated every frame
      getOutput(port: string): unknown {
        if (port !== "field") {
          throw new Error(`FX/Bloom: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx): void {
        const threshold = Number(ctx.getParam("threshold"));
        const strength = Number(ctx.getParam("strength"));
        const radius = Number(ctx.getParam("radius"));
        const enabledRaw = ctx.getParam("enabled");
        const enabled =
          typeof enabledRaw === "boolean"
            ? enabledRaw
            : enabledRaw === 1 || enabledRaw === "true";

        last = createBloomPassState({
          enabled,
          threshold: Number.isFinite(threshold) ? threshold : 0.62,
          strength: Number.isFinite(strength) ? strength : 1.8,
          radius: Number.isFinite(radius) ? radius : 0.85,
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
