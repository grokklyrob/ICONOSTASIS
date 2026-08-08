/**
 * FX/Feedback — one-frame delay; only legal cycle break (§7.1).
 * Signal path for M1.4; field path samples opaque handles the same way.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";

export const FX_FEEDBACK_TYPE = "FX/Feedback" as const;

/**
 * Cook protocol with GraphEvaluator:
 * 1) First cook (no inputs): publish delayed value.
 * 2) Second cook (inputs present): sample `in` * gain into delay for next frame.
 */
export const feedbackFactory: OperatorFactory = {
  type: FX_FEEDBACK_TYPE,
  family: "FX",
  inputs: [
    { id: "in", type: "signal", label: "signal or field handle" },
  ],
  outputs: [
    { id: "out", type: "signal" },
    { id: "field", type: "field", label: "delayed field (if field wired)" },
  ],
  params: [
    {
      id: "gain",
      type: "float",
      default: 1,
      min: 0,
      max: 2,
      modulatable: true,
      exposable: true,
    },
    {
      id: "decay",
      type: "float",
      default: 1,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let delayed: unknown = 0;
    let published = false;

    const instance: OperatorInstance = {
      id,
      type: FX_FEEDBACK_TYPE,
      family: "FX",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "out" || port === "field") return delayed;
        throw new Error(`FX/Feedback: unknown port "${port}"`);
      },
      cook(ctx) {
        const gain = asFinite(ctx.getParam("gain"), 1);
        const decay = asFinite(ctx.getParam("decay"), 1);
        const input = ctx.getInput("in");

        if (input === undefined) {
          // Publish phase — output previous delayed value.
          const out =
            typeof delayed === "number"
              ? (delayed as number) * decay
              : delayed;
          ctx.setOutput("out", typeof out === "number" ? out : 0);
          ctx.setOutput("field", delayed);
          published = true;
          return;
        }

        // Sample phase — capture input for next frame.
        if (typeof input === "number") {
          delayed = input * gain;
        } else {
          delayed = input;
        }
        // Keep outputs as previous delayed (already published this frame).
        if (!published) {
          ctx.setOutput(
            "out",
            typeof delayed === "number" ? delayed : 0,
          );
          ctx.setOutput("field", delayed);
        }
        published = false;
      },
      dispose() {
        delayed = 0;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
