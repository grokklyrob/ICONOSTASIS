/**
 * SRC/Time — frame clock as signals (architecture.md Appendix A, §18 M0).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const SRC_TIME_TYPE = "SRC/Time" as const;

export const timeFactory: OperatorFactory = {
  type: SRC_TIME_TYPE,
  family: "SRC",
  inputs: [],
  outputs: [
    { id: "time", type: "signal", label: "time (s)" },
    { id: "delta", type: "signal", label: "delta (s)" },
    { id: "frame", type: "signal", label: "frame" },
  ],
  params: [
    {
      id: "speed",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "×",
    },
  ],
  create(id, params): OperatorInstance {
    const outputs = {
      time: 0,
      delta: 0,
      frame: 0,
    };

    const instance: OperatorInstance = {
      id,
      type: SRC_TIME_TYPE,
      family: "SRC",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port === "time") return outputs.time;
        if (port === "delta") return outputs.delta;
        if (port === "frame") return outputs.frame;
        throw new Error(`SRC/Time: unknown port "${port}"`);
      },
      cook(ctx): void {
        const speed = Number(ctx.getParam("speed"));
        const safeSpeed = Number.isFinite(speed) ? speed : 1;
        // speed scales both elapsed time and delta (§7.2 modulatable clock).
        outputs.time = ctx.time * safeSpeed;
        outputs.delta = ctx.delta * safeSpeed;
        outputs.frame = ctx.frame;
        ctx.setOutput("time", outputs.time);
        ctx.setOutput("delta", outputs.delta);
        ctx.setOutput("frame", outputs.frame);
      },
      dispose(): void {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
