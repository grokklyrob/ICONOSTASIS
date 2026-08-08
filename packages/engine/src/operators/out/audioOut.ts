/**
 * OUT/AudioOut — master bus sink for graph audio (Appendix A, §11.1).
 * Headless: records gain/level; host wires Web Audio destination.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite } from "../shared/paramUtils.js";

export const OUT_AUDIO_OUT_TYPE = "OUT/AudioOut" as const;

export interface AudioOutState {
  kind: "audioOut";
  gain: number;
  muted: boolean;
  /** Last media token / handle from input. */
  media: unknown;
}

export const audioOutFactory: OperatorFactory = {
  type: OUT_AUDIO_OUT_TYPE,
  family: "OUT",
  inputs: [
    { id: "media", type: "media" },
    { id: "gain", type: "signal" },
  ],
  outputs: [],
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
      id: "muted",
      type: "bool",
      default: false,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: AudioOutState = {
      kind: "audioOut",
      gain: 1,
      muted: false,
      media: undefined,
    };

    const instance: OperatorInstance & { lastState: AudioOutState } = {
      id,
      type: OUT_AUDIO_OUT_TYPE,
      family: "OUT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      get lastState() {
        return last;
      },
      getOutput() {
        return undefined;
      },
      cook(ctx) {
        const gainIn = ctx.getInput("gain");
        const gain =
          gainIn !== undefined && gainIn !== null
            ? Number(gainIn)
            : asFinite(ctx.getParam("gain"), 1);
        const muted = asBool(ctx.getParam("muted"), false);
        last = {
          kind: "audioOut",
          gain: Number.isFinite(gain) ? gain : 1,
          muted,
          media: ctx.getInput("media"),
        };
        // Host may read lastState; no backend required for headless cook.
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
