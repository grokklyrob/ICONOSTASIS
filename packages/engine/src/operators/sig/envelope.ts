/**
 * SIG/Envelope — ADSR envelope driven by gate signal (Appendix A).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asSignal } from "../shared/paramUtils.js";

export const SIG_ENVELOPE_TYPE = "SIG/Envelope" as const;

type EnvStage = "idle" | "attack" | "decay" | "sustain" | "release";

export const envelopeFactory: OperatorFactory = {
  type: SIG_ENVELOPE_TYPE,
  family: "SIG",
  inputs: [
    { id: "gate", type: "signal", label: "gate (>0 = on)" },
    { id: "trigger", type: "event", label: "one-shot trigger" },
  ],
  outputs: [{ id: "out", type: "signal" }],
  params: [
    {
      id: "attack",
      type: "float",
      default: 0.05,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "s",
    },
    {
      id: "decay",
      type: "float",
      default: 0.1,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "s",
    },
    {
      id: "sustain",
      type: "float",
      default: 0.7,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
    },
    {
      id: "release",
      type: "float",
      default: 0.2,
      min: 0,
      modulatable: true,
      exposable: true,
      unit: "s",
    },
    {
      id: "gate",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let out = 0;
    let stage: EnvStage = "idle";
    let stageT = 0;
    let levelAtRelease = 0;
    let prevGate = false;

    const instance: OperatorInstance = {
      id,
      type: SIG_ENVELOPE_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "out") {
          throw new Error(`SIG/Envelope: unknown port "${port}"`);
        }
        return out;
      },
      cook(ctx) {
        const attack = Math.max(0, asFinite(ctx.getParam("attack"), 0.05));
        const decay = Math.max(0, asFinite(ctx.getParam("decay"), 0.1));
        const sustain = Math.min(
          1,
          Math.max(0, asFinite(ctx.getParam("sustain"), 0.7)),
        );
        const release = Math.max(0, asFinite(ctx.getParam("release"), 0.2));
        const gateIn = ctx.getInput("gate");
        const trigIn = ctx.getInput("trigger");
        const gateParam = asFinite(ctx.getParam("gate"), 0);
        const gateVal =
          gateIn !== undefined && gateIn !== null
            ? asSignal(gateIn)
            : gateParam;
        const gateOn = Math.abs(gateVal) > 1e-9;
        const trig =
          trigIn !== undefined &&
          trigIn !== null &&
          Math.abs(asSignal(trigIn)) > 1e-9;
        const dt = ctx.delta > 0 ? ctx.delta : 1 / 60;

        // Rising gate or trigger starts attack
        if ((gateOn && !prevGate) || trig) {
          stage = "attack";
          stageT = 0;
        } else if (!gateOn && prevGate && stage !== "idle" && stage !== "release") {
          stage = "release";
          stageT = 0;
          levelAtRelease = out;
        }
        prevGate = gateOn;

        stageT += dt;

        switch (stage) {
          case "idle":
            out = 0;
            break;
          case "attack": {
            if (attack <= 1e-6) {
              out = 1;
              stage = "decay";
              stageT = 0;
            } else {
              out = Math.min(1, stageT / attack);
              if (stageT >= attack) {
                out = 1;
                stage = "decay";
                stageT = 0;
              }
            }
            break;
          }
          case "decay": {
            if (decay <= 1e-6) {
              out = sustain;
              stage = gateOn ? "sustain" : "release";
              stageT = 0;
              levelAtRelease = out;
            } else {
              const t = Math.min(1, stageT / decay);
              out = 1 + (sustain - 1) * t;
              if (stageT >= decay) {
                out = sustain;
                stage = gateOn ? "sustain" : "release";
                stageT = 0;
                levelAtRelease = out;
              }
            }
            break;
          }
          case "sustain":
            out = sustain;
            if (!gateOn) {
              stage = "release";
              stageT = 0;
              levelAtRelease = out;
            }
            break;
          case "release": {
            if (release <= 1e-6) {
              out = 0;
              stage = "idle";
            } else {
              const t = Math.min(1, stageT / release);
              out = levelAtRelease * (1 - t);
              if (stageT >= release) {
                out = 0;
                stage = "idle";
              }
            }
            break;
          }
          default: {
            const _e: never = stage;
            void _e;
          }
        }

        if (!Number.isFinite(out)) out = 0;
        ctx.setOutput("out", out);
      },
      dispose() {
        stage = "idle";
        out = 0;
        prevGate = false;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
