/**
 * SRC/Seed — deterministic seed source (Appendix A).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";

export const SRC_SEED_TYPE = "SRC/Seed" as const;

/** Mix seed param into a stable float in [0, 1). */
export function seedToUnit(seed: number): number {
  const x = Math.sin((seed + 1.2345) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const seedFactory: OperatorFactory = {
  type: SRC_SEED_TYPE,
  family: "SRC",
  inputs: [],
  outputs: [
    { id: "seed", type: "signal", label: "raw seed" },
    { id: "unit", type: "signal", label: "hash in [0,1)" },
  ],
  params: [
    {
      id: "seed",
      type: "seed",
      default: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let seedOut = 0;
    let unit = 0;
    const instance: OperatorInstance = {
      id,
      type: SRC_SEED_TYPE,
      family: "SRC",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "seed") return seedOut;
        if (port === "unit") return unit;
        throw new Error(`SRC/Seed: unknown port "${port}"`);
      },
      cook(ctx) {
        seedOut = asFinite(ctx.getParam("seed"), 0);
        unit = seedToUnit(seedOut);
        ctx.setOutput("seed", seedOut);
        ctx.setOutput("unit", unit);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
