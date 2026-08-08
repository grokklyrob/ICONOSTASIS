/**
 * SIG/Smooth — exponential lag / one-euro-ish toward input (Appendix A).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asSignal } from "../shared/paramUtils.js";

export const SIG_SMOOTH_TYPE = "SIG/Smooth" as const;

/**
 * Exponential smoothing: y += (x - y) * (1 - e^(-dt / tau))
 * tau → 0 snaps; large tau lags.
 */
export function smoothStep(
  current: number,
  target: number,
  dt: number,
  tau: number,
): number {
  if (!Number.isFinite(current)) current = target;
  if (!Number.isFinite(target)) return current;
  if (tau <= 1e-6 || dt <= 0) return target;
  const alpha = 1 - Math.exp(-dt / tau);
  return current + (target - current) * alpha;
}

export const smoothFactory: OperatorFactory = {
  type: SIG_SMOOTH_TYPE,
  family: "SIG",
  inputs: [{ id: "in", type: "signal" }],
  outputs: [{ id: "out", type: "signal" }],
  params: [
    {
      id: "tau",
      type: "float",
      default: 0.15,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "s",
    },
    {
      id: "value",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let y = 0;
    let initialized = false;
    const instance: OperatorInstance = {
      id,
      type: SIG_SMOOTH_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "out") throw new Error(`SIG/Smooth: unknown port "${port}"`);
        return y;
      },
      cook(ctx) {
        const tau = asFinite(ctx.getParam("tau"), 0.15);
        const inRaw = ctx.getInput("in");
        const target =
          inRaw !== undefined && inRaw !== null
            ? asSignal(inRaw)
            : asFinite(ctx.getParam("value"), 0);
        if (!initialized) {
          y = target;
          initialized = true;
        } else {
          const dt = ctx.delta > 0 ? ctx.delta : 1 / 60;
          y = smoothStep(y, target, dt, Math.max(0, tau));
        }
        ctx.setOutput("out", y);
      },
      dispose() {
        initialized = false;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
