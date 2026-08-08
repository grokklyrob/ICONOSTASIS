/**
 * SIG/Logic — compare / boolean / trigger-gate (Appendix A; standalone Trigger/Gate out of v1).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asSignal } from "../shared/paramUtils.js";

export const SIG_LOGIC_TYPE = "SIG/Logic" as const;

export type LogicOp =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "and"
  | "or"
  | "not"
  | "gate"
  | "trigger";

const OPS: readonly LogicOp[] = [
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "and",
  "or",
  "not",
  "gate",
  "trigger",
] as const;

function parseOp(raw: unknown): LogicOp {
  const s = String(raw);
  return (OPS as readonly string[]).includes(s) ? (s as LogicOp) : "gt";
}

function truthy(n: number): boolean {
  return Math.abs(n) > 1e-9;
}

export const logicFactory: OperatorFactory = {
  type: SIG_LOGIC_TYPE,
  family: "SIG",
  inputs: [
    { id: "a", type: "signal" },
    { id: "b", type: "signal" },
  ],
  outputs: [
    { id: "out", type: "signal" },
    { id: "event", type: "event" },
  ],
  params: [
    {
      id: "op",
      type: "enum",
      default: "gt",
      enumValues: [...OPS],
      modulatable: false,
      exposable: true,
    },
    {
      id: "a",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "b",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "epsilon",
      type: "float",
      default: 1e-6,
      min: 0,
      modulatable: false,
      exposable: false,
    },
  ],
  create(id, params): OperatorInstance {
    let out = 0;
    let event = 0;
    let prevA = 0;
    let hasPrev = false;

    const instance: OperatorInstance = {
      id,
      type: SIG_LOGIC_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "out") return out;
        if (port === "event") return event;
        throw new Error(`SIG/Logic: unknown port "${port}"`);
      },
      cook(ctx) {
        const op = parseOp(ctx.getParam("op"));
        const eps = asFinite(ctx.getParam("epsilon"), 1e-6);
        const aIn = ctx.getInput("a");
        const bIn = ctx.getInput("b");
        const a =
          aIn !== undefined && aIn !== null
            ? asSignal(aIn)
            : asFinite(ctx.getParam("a"), 0);
        const b =
          bIn !== undefined && bIn !== null
            ? asSignal(bIn)
            : asFinite(ctx.getParam("b"), 0);

        event = 0;
        let result = false;

        switch (op) {
          case "gt":
            result = a > b;
            break;
          case "gte":
            result = a >= b;
            break;
          case "lt":
            result = a < b;
            break;
          case "lte":
            result = a <= b;
            break;
          case "eq":
            result = Math.abs(a - b) <= eps;
            break;
          case "and":
            result = truthy(a) && truthy(b);
            break;
          case "or":
            result = truthy(a) || truthy(b);
            break;
          case "not":
            result = !truthy(a);
            break;
          case "gate":
            // Pass a when gate b is high, else 0
            out = truthy(b) ? a : 0;
            ctx.setOutput("out", out);
            ctx.setOutput("event", 0);
            return;
          case "trigger": {
            // Rising edge of a → 1 for one frame on event + out
            const high = truthy(a);
            const was = hasPrev && truthy(prevA);
            const edge = high && !was;
            out = edge ? 1 : 0;
            event = edge ? 1 : 0;
            prevA = a;
            hasPrev = true;
            ctx.setOutput("out", out);
            ctx.setOutput("event", event);
            return;
          }
          default: {
            const _e: never = op;
            void _e;
          }
        }

        out = result ? 1 : 0;
        const prevOut = hasPrev ? prevA : 0;
        event = out === 1 && prevOut === 0 ? 1 : 0;
        prevA = out;
        hasPrev = true;

        ctx.setOutput("out", out);
        ctx.setOutput("event", event);
      },
      dispose() {
        hasPrev = false;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
