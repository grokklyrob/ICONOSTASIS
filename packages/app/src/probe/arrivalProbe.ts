/**
 * Live Arrival Law probe host (§7.1, §18 M1 exit).
 * Owns a standalone TEST/SyntheticAsync instance with fake latency —
 * does not require graph wiring. Policies: signal crossfade, text stream/
 * replace, audio queue, field/geometry fade slots, fail, cacheScope.
 */

import {
  resetSyntheticGpuFadeQueue,
  syntheticAsyncFactory,
  type SyntheticAsyncView,
  type SyntheticMode,
} from "@iconostasis/engine";
import type { OperatorInstance, ParamValue } from "@iconostasis/engine";

export type { SyntheticMode, SyntheticAsyncView };

type SynthOp = OperatorInstance & { asyncView: SyntheticAsyncView };

const DEFAULTS: Record<string, ParamValue> = {
  mode: "signal",
  generation: 0,
  latencyMs: 250,
  arrivalWindowMs: 400,
  payload: "1",
  streamChunk: "…",
  cacheScope: "station",
  stationId: "probe",
  audioPlaying: false,
};

export class ArrivalProbeHost {
  private readonly op: SynthOp;
  private generation = 0;
  private params: Record<string, ParamValue> = { ...DEFAULTS };
  private t0 = performance.now();
  private frame = 0;
  private raf = 0;
  private running = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    resetSyntheticGpuFadeQueue("wayside");
    this.op = syntheticAsyncFactory.create(
      "arrival_probe",
      this.params,
    ) as SynthOp;
    this.op.params = { ...this.params };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  getView(): SyntheticAsyncView {
    return this.op.asyncView;
  }

  getParams(): Readonly<Record<string, ParamValue>> {
    return this.params;
  }

  setMode(mode: SyntheticMode): void {
    this.params.mode = mode;
    this.op.params.mode = mode;
    // Sensible payload defaults per mode
    if (mode === "signal") this.params.payload = String(this.generation + 1);
    else if (mode === "text-stream") {
      this.params.payload = "In ";
      this.params.streamChunk = "lux ";
    } else if (mode === "text-replace") {
      this.params.payload = `text-gen-${this.generation + 1}`;
    } else if (mode === "audio") {
      this.params.payload = `buf-${this.generation + 1}`;
      this.params.audioPlaying = this.generation > 0;
    } else if (mode === "field" || mode === "geometry") {
      this.params.payload = mode;
    } else if (mode === "fail") {
      this.params.payload = "x";
    }
    this.op.params = { ...this.params };
    this.emit();
  }

  setLatencyMs(ms: number): void {
    this.params.latencyMs = Math.max(0, ms);
    this.op.params.latencyMs = this.params.latencyMs;
    this.emit();
  }

  setCacheScope(scope: "station" | "global"): void {
    this.params.cacheScope = scope;
    this.op.params.cacheScope = scope;
    this.emit();
  }

  setAudioPlaying(playing: boolean): void {
    this.params.audioPlaying = playing;
    this.op.params.audioPlaying = playing;
    this.emit();
  }

  /** Bump generation → schedules deferred settle (fake latency). */
  fire(): void {
    this.generation += 1;
    this.params.generation = this.generation;
    if (this.params.mode === "signal") {
      this.params.payload = String(10 * this.generation);
    } else if (this.params.mode === "text-replace") {
      this.params.payload = `verse ${this.generation}`;
    } else if (this.params.mode === "audio") {
      this.params.payload = `buf-${this.generation}`;
      // After first buffer, treat as playing so next queues
      if (this.generation > 1) this.params.audioPlaying = true;
    } else if (this.params.mode === "text-stream") {
      this.params.payload = `tok${this.generation} `;
      this.params.streamChunk = "·";
    }
    this.op.params = { ...this.params };
    this.op.dirty = true;
    this.emit();
  }

  /** Edge-trigger audio cue boundary (promote queue). */
  cueAudio(): void {
    this.tick(true);
    this.emit();
  }

  private tick(forceCue = false): void {
    this.frame += 1;
    const now = performance.now();
    const time = (now - this.t0) / 1000;
    const delta = 1 / 60;
    const outputs = new Map<string, unknown>();

    this.op.cook({
      time,
      delta,
      frame: this.frame,
      scheduleDeferred: (fn, delayMs) => {
        window.setTimeout(() => {
          fn();
          this.emit();
        }, Math.max(0, delayMs));
      },
      getInput: (port) => {
        if (port === "cue" && forceCue) return true;
        return undefined;
      },
      getParam: (id) => {
        const v = this.op.params[id];
        if (v === undefined) {
          throw new Error(`probe param missing: ${id}`);
        }
        return v;
      },
      getBaseParam: (id) => this.op.params[id],
      setOutput: (port, value) => {
        outputs.set(port, value);
      },
    });
    this.emit();
  }
}
