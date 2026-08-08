/**
 * SRC/Input — unified pointer + keyboard (§11.2, AMD-05).
 * Host injects InputFrameSnapshot via EvaluatorHost / FrameTime.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asString } from "../shared/paramUtils.js";
import {
  EMPTY_INPUT_FRAME,
  type InputFrameSnapshot,
} from "./inputFrame.js";

export const SRC_INPUT_TYPE = "SRC/Input" as const;

export const inputFactory: OperatorFactory = {
  type: SRC_INPUT_TYPE,
  family: "SRC",
  inputs: [],
  outputs: [
    { id: "x", type: "signal" },
    { id: "y", type: "signal" },
    { id: "vx", type: "signal" },
    { id: "vy", type: "signal" },
    { id: "down", type: "signal" },
    { id: "key", type: "signal", label: "watched key held (0/1)" },
    { id: "keyEdge", type: "event", label: "watched key edge" },
    { id: "hit", type: "event", label: "raycast hit this frame" },
  ],
  params: [
    {
      id: "watchKey",
      type: "string",
      default: " ",
      modulatable: false,
      exposable: true,
    },
    {
      id: "hitTag",
      type: "string",
      default: "",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    const outs = {
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      down: 0,
      key: 0,
      keyEdge: 0,
      hit: 0,
    };

    const instance: OperatorInstance = {
      id,
      type: SRC_INPUT_TYPE,
      family: "SRC",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (!(port in outs)) {
          throw new Error(`SRC/Input: unknown port "${port}"`);
        }
        return outs[port as keyof typeof outs];
      },
      cook(ctx) {
        const frame: InputFrameSnapshot = ctx.input ?? EMPTY_INPUT_FRAME;
        const watch = asString(ctx.getParam("watchKey"), " ").toLowerCase();
        const wantHit = asString(ctx.getParam("hitTag"), "");

        outs.x = frame.pointerX;
        outs.y = frame.pointerY;
        outs.vx = frame.pointerVx;
        outs.vy = frame.pointerVy;
        outs.down = frame.pointerDown ? 1 : 0;

        const keys = (frame.keysDown ?? []).map((k) => k.toLowerCase());
        const edges = (frame.keysEdge ?? []).map((k) => k.toLowerCase());
        outs.key = watch.length > 0 && keys.includes(watch) ? 1 : 0;
        outs.keyEdge = watch.length > 0 && edges.includes(watch) ? 1 : 0;

        outs.hit =
          wantHit.length > 0 && frame.hitTag === wantHit
            ? 1
            : frame.hitTag && wantHit.length === 0
              ? 1
              : 0;

        for (const [k, v] of Object.entries(outs)) {
          ctx.setOutput(k, v);
        }
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
