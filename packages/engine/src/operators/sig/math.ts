/**
 * SIG/Math — arithmetic + remap (Appendix A; standalone Map/Remap is out of v1).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asSignal } from "../shared/paramUtils.js";

export const SIG_MATH_TYPE = "SIG/Math" as const;

export type MathOp =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "pow"
  | "min"
  | "max"
  | "abs"
  | "remap"
  | "clamp"
  | "negate";

const OPS: readonly MathOp[] = [
  "add",
  "sub",
  "mul",
  "div",
  "pow",
  "min",
  "max",
  "abs",
  "remap",
  "clamp",
  "negate",
] as const;

export function evalMath(
  op: MathOp,
  a: number,
  b: number,
  remap: { in0: number; in1: number; out0: number; out1: number },
): number {
  switch (op) {
    case "add":
      return a + b;
    case "sub":
      return a - b;
    case "mul":
      return a * b;
    case "div":
      return b === 0 ? 0 : a / b;
    case "pow":
      return Math.pow(a, b);
    case "min":
      return Math.min(a, b);
    case "max":
      return Math.max(a, b);
    case "abs":
      return Math.abs(a);
    case "negate":
      return -a;
    case "clamp":
      return Math.min(remap.in1, Math.max(remap.in0, a));
    case "remap": {
      const span = remap.in1 - remap.in0;
      const t = span === 0 ? 0 : (a - remap.in0) / span;
      const c = Math.min(1, Math.max(0, t));
      return remap.out0 + c * (remap.out1 - remap.out0);
    }
    default: {
      const _e: never = op;
      return _e;
    }
  }
}

function parseOp(raw: unknown): MathOp {
  const s = String(raw);
  return (OPS as readonly string[]).includes(s) ? (s as MathOp) : "add";
}

export const mathFactory: OperatorFactory = {
  type: SIG_MATH_TYPE,
  family: "SIG",
  inputs: [
    { id: "a", type: "signal" },
    { id: "b", type: "signal" },
  ],
  outputs: [{ id: "out", type: "signal" }],
  params: [
    {
      id: "op",
      type: "enum",
      default: "add",
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
      id: "in0",
      type: "float",
      default: 0,
      modulatable: false,
      exposable: true,
    },
    {
      id: "in1",
      type: "float",
      default: 1,
      modulatable: false,
      exposable: true,
    },
    {
      id: "out0",
      type: "float",
      default: 0,
      modulatable: false,
      exposable: true,
    },
    {
      id: "out1",
      type: "float",
      default: 1,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let out = 0;
    const instance: OperatorInstance = {
      id,
      type: SIG_MATH_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "out") throw new Error(`SIG/Math: unknown port "${port}"`);
        return out;
      },
      cook(ctx) {
        const op = parseOp(ctx.getParam("op"));
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
        const remap = {
          in0: asFinite(ctx.getParam("in0"), 0),
          in1: asFinite(ctx.getParam("in1"), 1),
          out0: asFinite(ctx.getParam("out0"), 0),
          out1: asFinite(ctx.getParam("out1"), 1),
        };
        out = evalMath(op, a, b, remap);
        if (!Number.isFinite(out)) out = 0;
        ctx.setOutput("out", out);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
