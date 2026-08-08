/**
 * SIG/Noise — deterministic noise from seed + time (Appendix A).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const SIG_NOISE_TYPE = "SIG/Noise" as const;

export type NoiseMode = "value" | "smooth" | "randomHold";

/** 1D hash → [0, 1). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

/** Smoothstep interpolation. */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise at continuous x; period-ish via floor cells. */
export function valueNoise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i + seed * 19.19);
  const b = hash01(i + 1 + seed * 19.19);
  return a + (b - a) * fade(f);
}

export const noiseFactory: OperatorFactory = {
  type: SIG_NOISE_TYPE,
  family: "SIG",
  inputs: [],
  outputs: [{ id: "out", type: "signal" }],
  params: [
    {
      id: "mode",
      type: "enum",
      default: "smooth",
      enumValues: ["value", "smooth", "randomHold"],
      modulatable: false,
      exposable: true,
    },
    {
      id: "rate",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "Hz",
    },
    {
      id: "amp",
      type: "float",
      default: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "offset",
      type: "float",
      default: 0,
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
    {
      id: "bipolar",
      type: "bool",
      default: true,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let out = 0;
    let hold = 0;
    let holdPhase = -1;
    const instance: OperatorInstance = {
      id,
      type: SIG_NOISE_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "out") throw new Error(`SIG/Noise: unknown port "${port}"`);
        return out;
      },
      cook(ctx) {
        const mode = asString(ctx.getParam("mode"), "smooth") as NoiseMode;
        const rate = asFinite(ctx.getParam("rate"), 1);
        const amp = asFinite(ctx.getParam("amp"), 1);
        const offset = asFinite(ctx.getParam("offset"), 0);
        const seed = asFinite(ctx.getParam("seed"), 0);
        const bipolar = ctx.getParam("bipolar") !== false && ctx.getParam("bipolar") !== 0;

        let n01: number;
        if (mode === "value") {
          n01 = hash01(Math.floor(ctx.time * Math.max(0, rate) * 60) + seed * 97);
        } else if (mode === "randomHold") {
          const cell = Math.floor(ctx.time * Math.max(0, rate));
          if (cell !== holdPhase) {
            holdPhase = cell;
            hold = hash01(cell + seed * 13.13);
          }
          n01 = hold;
        } else {
          // smooth value noise
          n01 = valueNoise1D(ctx.time * Math.max(0, rate), seed);
        }

        const unit = bipolar ? n01 * 2 - 1 : n01;
        out = unit * amp + offset;
        ctx.setOutput("out", out);
      },
      dispose() {
        holdPhase = -1;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
