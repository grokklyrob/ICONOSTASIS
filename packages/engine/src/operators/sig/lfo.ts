/**
 * SIG/LFO — low-frequency oscillator (architecture.md Appendix A, §18 M0).
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const SIG_LFO_TYPE = "SIG/LFO" as const;

export type LfoWaveform = "sine" | "triangle" | "saw" | "square";

const WAVEFORMS: readonly LfoWaveform[] = [
  "sine",
  "triangle",
  "saw",
  "square",
] as const;

/** Evaluate waveform at phase in [0, 1). Output bipolar [-1, 1]. */
export function evalLfoWave(waveform: LfoWaveform, phase01: number): number {
  const p = phase01 - Math.floor(phase01); // wrap to [0, 1)
  switch (waveform) {
    case "sine":
      return Math.sin(p * Math.PI * 2);
    case "triangle":
      // 0→1→0→-1→0 style peak at 0.25
      return 1 - 4 * Math.abs(p - 0.5);
    case "saw":
      return 2 * p - 1;
    case "square":
      return p < 0.5 ? 1 : -1;
    default: {
      const _exhaustive: never = waveform;
      return _exhaustive;
    }
  }
}

function asWaveform(value: ParamValue): LfoWaveform {
  if (typeof value === "string" && (WAVEFORMS as readonly string[]).includes(value)) {
    return value as LfoWaveform;
  }
  return "sine";
}

export const lfoFactory: OperatorFactory = {
  type: SIG_LFO_TYPE,
  family: "SIG",
  inputs: [
    {
      id: "phase",
      type: "signal",
      label: "phase (optional, 0–1 cycles)",
    },
  ],
  outputs: [{ id: "out", type: "signal" }],
  params: [
    {
      id: "waveform",
      type: "enum",
      default: "sine",
      enumValues: WAVEFORMS,
      modulatable: false,
      exposable: true,
    },
    {
      id: "frequency",
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
      id: "phase",
      type: "float",
      default: 0,
      min: 0,
      max: 1,
      modulatable: true,
      exposable: true,
      unit: "cycles",
    },
  ],
  create(id, params): OperatorInstance {
    const outputs = { out: 0 };
    /** Accumulated free-run phase in cycles (for smooth frequency modulation). */
    let phaseAcc = 0;
    let lastTime = 0;
    let hasTime = false;

    const instance: OperatorInstance = {
      id,
      type: SIG_LFO_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port: string): unknown {
        if (port !== "out") throw new Error(`SIG/LFO: unknown port "${port}"`);
        return outputs.out;
      },
      cook(ctx): void {
        const waveform = asWaveform(ctx.getParam("waveform"));
        const frequency = Number(ctx.getParam("frequency"));
        const amp = Number(ctx.getParam("amp"));
        const offset = Number(ctx.getParam("offset"));
        const phaseParam = Number(ctx.getParam("phase"));

        const phaseIn = ctx.getInput("phase");
        let phase01: number;

        if (phaseIn !== undefined && phaseIn !== null) {
          // External phase drive (cycles); param phase is an offset.
          phase01 = Number(phaseIn) + (Number.isFinite(phaseParam) ? phaseParam : 0);
        } else {
          // Free-run: integrate frequency over wall time using ctx.time.
          const t = ctx.time;
          if (!hasTime) {
            lastTime = t;
            hasTime = true;
          }
          const dt = Math.max(0, t - lastTime);
          lastTime = t;
          const freq = Number.isFinite(frequency) ? frequency : 0;
          phaseAcc += dt * freq;
          phase01 = phaseAcc + (Number.isFinite(phaseParam) ? phaseParam : 0);
        }

        const wave = evalLfoWave(waveform, phase01);
        const a = Number.isFinite(amp) ? amp : 1;
        const o = Number.isFinite(offset) ? offset : 0;
        outputs.out = wave * a + o;
        ctx.setOutput("out", outputs.out);
      },
      dispose(): void {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
