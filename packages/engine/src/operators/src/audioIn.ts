/**
 * SRC/AudioIn — RMS, peak, 4 log-spaced bands (§11.1, Appendix A, §18 M0).
 * cook is void; never touches Web Audio — host injects AudioFrameSnapshot.
 */

import {
  computeAnalyserLevels,
  smoothToward,
} from "../../audio/analyser.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const SRC_AUDIO_IN_TYPE = "SRC/AudioIn" as const;

const PORTS = [
  "rms",
  "peak",
  "bandLow",
  "bandMidLow",
  "bandMidHigh",
  "bandHigh",
] as const;

type AudioOutPort = (typeof PORTS)[number];

export const audioInFactory: OperatorFactory = {
  type: SRC_AUDIO_IN_TYPE,
  family: "SRC",
  inputs: [],
  outputs: [
    { id: "rms", type: "signal" },
    { id: "peak", type: "signal" },
    { id: "bandLow", type: "signal", label: "low" },
    { id: "bandMidLow", type: "signal", label: "mid-low" },
    { id: "bandMidHigh", type: "signal", label: "mid-high" },
    { id: "bandHigh", type: "signal", label: "high" },
  ],
  params: [
    {
      id: "smoothing",
      type: "float",
      default: 0.7,
      min: 0,
      max: 1,
      step: 0.01,
      modulatable: true,
      exposable: true,
      unit: "lag",
    },
    {
      // Documented for host AnalyserNode setup; cook does not allocate FFT.
      id: "fftSize",
      type: "int",
      default: 2048,
      min: 32,
      max: 32768,
      modulatable: false,
      exposable: false,
    },
  ],
  create(id, params): OperatorInstance {
    const outputs: Record<AudioOutPort, number> = {
      rms: 0,
      peak: 0,
      bandLow: 0,
      bandMidLow: 0,
      bandMidHigh: 0,
      bandHigh: 0,
    };

    const instance: OperatorInstance = {
      id,
      type: SRC_AUDIO_IN_TYPE,
      family: "SRC",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if ((PORTS as readonly string[]).includes(port)) {
          return outputs[port as AudioOutPort];
        }
        throw new Error(`SRC/AudioIn: unknown port "${port}"`);
      },
      cook(ctx): void {
        const lag = Number(ctx.getParam("smoothing"));
        const raw = computeAnalyserLevels(ctx.audio);

        outputs.rms = smoothToward(outputs.rms, raw.rms, lag);
        outputs.peak = smoothToward(outputs.peak, raw.peak, lag);
        outputs.bandLow = smoothToward(outputs.bandLow, raw.bands[0], lag);
        outputs.bandMidLow = smoothToward(
          outputs.bandMidLow,
          raw.bands[1],
          lag,
        );
        outputs.bandMidHigh = smoothToward(
          outputs.bandMidHigh,
          raw.bands[2],
          lag,
        );
        outputs.bandHigh = smoothToward(outputs.bandHigh, raw.bands[3], lag);

        for (const p of PORTS) {
          ctx.setOutput(p, outputs[p]);
        }
      },
      dispose(): void {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
