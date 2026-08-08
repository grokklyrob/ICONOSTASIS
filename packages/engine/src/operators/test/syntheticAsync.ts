/**
 * TEST/SyntheticAsync — M1 Arrival Law probe (architecture.md §7.1, §18 M1).
 *
 * Not part of the Appendix A net-31 catalog. Proves lastGoodValue, status,
 * presentation, cacheScope, failure + fake latency, and port-type arrival
 * policies under controlled generation tokens — before any real AI adapter.
 *
 * cook(ctx): void — schedules deferred settle; never returns a Promise (AMD-01).
 */

import {
  advanceSignalCrossfade,
  beginHoldSwap,
  beginSignalCrossfade,
  commitHoldSwap,
  onAudioCueBoundary,
  onAudioFresh,
  textStreamAppend,
  type AudioArrivalState,
  type CrossfadeState,
  type HoldSwapState,
} from "../../async/arrival.js";
import {
  asyncCacheKey,
  parseCacheScope,
  type CacheScope,
} from "../../async/cacheScope.js";
import {
  GpuFadeQueue,
  maxConcurrentGpuFades,
  type DeviceTier,
} from "../../async/gpuFadeQueue.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import type { AsyncPortState, AsyncStatus, Presentation } from "../../types/ports.js";

export const TEST_SYNTHETIC_ASYNC_TYPE = "TEST/SyntheticAsync" as const;

export type SyntheticMode =
  | "signal"
  | "text-stream"
  | "text-replace"
  | "audio"
  | "field"
  | "geometry"
  | "fail";

export interface SyntheticAsyncView {
  status: AsyncStatus;
  presentation: Presentation;
  lastGoodValue: unknown;
  errorMessage?: string;
  /** Last settled generation token (cache key material). */
  settledGeneration: number | undefined;
  loadStarted: boolean;
  /** Mode-specific presented value after arrival policy. */
  presented: unknown;
  /** Audio: currently queued token when presentation is queued. */
  audioQueued?: string;
  /** Field/geometry: whether this op holds an active GPU fade slot. */
  gpuFadeActive: boolean;
  cacheKey: string | undefined;
}

const MODES: SyntheticMode[] = [
  "signal",
  "text-stream",
  "text-replace",
  "audio",
  "field",
  "geometry",
  "fail",
];

function parseMode(raw: unknown): SyntheticMode {
  const s = String(raw);
  return (MODES as string[]).includes(s) ? (s as SyntheticMode) : "signal";
}

/**
 * Shared fade queue for field/geometry probe modes in a process.
 * Tests may replace via setSyntheticGpuFadeQueue.
 */
let sharedGpuFadeQueue: GpuFadeQueue = new GpuFadeQueue(
  maxConcurrentGpuFades("wayside"),
);

export function setSyntheticGpuFadeQueue(queue: GpuFadeQueue): void {
  sharedGpuFadeQueue = queue;
}

export function resetSyntheticGpuFadeQueue(tier: DeviceTier = "wayside"): void {
  sharedGpuFadeQueue = new GpuFadeQueue(maxConcurrentGpuFades(tier));
}

export function getSyntheticGpuFadeQueue(): GpuFadeQueue {
  return sharedGpuFadeQueue;
}

export const syntheticAsyncFactory: OperatorFactory = {
  type: TEST_SYNTHETIC_ASYNC_TYPE,
  family: "SIG",
  inputs: [
    {
      id: "cue",
      type: "event",
      label: "Audio cue boundary (truthy edge)",
    },
  ],
  outputs: [
    { id: "signal", type: "signal" },
    { id: "text", type: "text" },
    { id: "media", type: "media" },
    { id: "field", type: "field" },
    { id: "geometry", type: "geometry" },
  ],
  params: [
    {
      id: "mode",
      type: "enum",
      default: "signal",
      enumValues: [...MODES],
      modulatable: false,
      exposable: true,
    },
    {
      id: "generation",
      type: "int",
      default: 0,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "latencyMs",
      type: "float",
      default: 0,
      min: 0,
      modulatable: false,
      exposable: true,
    },
    {
      id: "arrivalWindowMs",
      type: "float",
      default: 100,
      min: 0,
      modulatable: false,
      exposable: true,
    },
    {
      id: "payload",
      type: "string",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "streamChunk",
      type: "string",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "cacheScope",
      type: "enum",
      default: "station",
      enumValues: ["station", "global"],
      modulatable: false,
      exposable: false,
    },
    {
      id: "stationId",
      type: "string",
      default: "default",
      modulatable: false,
      exposable: false,
    },
    {
      id: "audioPlaying",
      type: "bool",
      default: false,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance & { asyncView: SyntheticAsyncView } {
    const asyncState: AsyncPortState<unknown> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };

    let loadStarted = false;
    let inflightGeneration: number | undefined;
    let settledGeneration: number | undefined;
    let settledCacheKey: string | undefined;
    let presented: unknown = undefined;
    let signalFade: CrossfadeState | undefined;
    let textHold: HoldSwapState<string> = {
      presented: undefined,
      pending: undefined,
      status: "idle",
      presentation: "current",
    };
    let audioState: AudioArrivalState = {
      playing: undefined,
      queued: undefined,
      status: "idle",
      presentation: "current",
    };
    let gpuFadeActive = false;
    let lastCue = false;

    const schedule = (
      ctxSchedule: ((fn: () => void, delayMs: number) => void) | undefined,
      delayMs: number,
      fn: () => void,
    ): void => {
      if (ctxSchedule) {
        ctxSchedule(fn, delayMs);
        return;
      }
      // Default host path: real timer (demo); tests inject scheduleDeferred.
      setTimeout(fn, Math.max(0, delayMs));
    };

    const instance: OperatorInstance & { asyncView: SyntheticAsyncView } = {
      id,
      type: TEST_SYNTHETIC_ASYNC_TYPE,
      family: "SIG",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      get asyncView(): SyntheticAsyncView {
        return {
          status: asyncState.status,
          presentation: asyncState.presentation,
          lastGoodValue: asyncState.lastGoodValue,
          errorMessage: asyncState.errorMessage,
          settledGeneration,
          loadStarted,
          presented,
          audioQueued: audioState.queued,
          gpuFadeActive,
          cacheKey: settledCacheKey,
        };
      },
      getOutput(port: string): unknown {
        switch (port) {
          case "signal":
            return typeof presented === "number" ? presented : 0;
          case "text":
            return typeof presented === "string" ? presented : "";
          case "media":
            return audioState.playing;
          case "field":
          case "geometry":
            return presented;
          default:
            throw new Error(`TEST/SyntheticAsync: unknown port "${port}"`);
        }
      },
      cook(ctx): void {
        const mode = parseMode(ctx.getParam("mode"));
        const generation = Math.floor(Number(ctx.getParam("generation") ?? 0));
        const latencyMs = Number(ctx.getParam("latencyMs") ?? 0);
        const arrivalWindowMs = Number(ctx.getParam("arrivalWindowMs") ?? 100);
        const payload = String(ctx.getParam("payload") ?? "");
        const streamChunk = String(ctx.getParam("streamChunk") ?? "");
        const cacheScope = parseCacheScope(ctx.getParam("cacheScope")) as CacheScope;
        const stationId = String(ctx.getParam("stationId") ?? "default");
        const audioPlaying = Boolean(ctx.getParam("audioPlaying"));
        const cue = Boolean(ctx.getInput("cue"));

        const key = asyncCacheKey(
          id,
          cacheScope,
          stationId,
          `gen:${generation}`,
          `mode:${mode}`,
        );

        // Advance in-flight signal crossfade every frame.
        if (mode === "signal" && signalFade && signalFade.presentation === "fading") {
          const deltaMs = (ctx.delta > 0 ? ctx.delta : 1 / 60) * 1000;
          const advanced = advanceSignalCrossfade(signalFade, deltaMs);
          signalFade = advanced.state;
          presented = advanced.value;
          asyncState.presentation = signalFade.presentation;
          asyncState.status = "fresh";
          if (signalFade.presentation === "current") {
            asyncState.lastGoodValue = presented;
            signalFade = undefined;
          }
        }

        // Text-replace: commit hold after arrival window once pending exists.
        if (
          mode === "text-replace" &&
          textHold.pending !== undefined &&
          textHold.presentation === "queued"
        ) {
          // Commit on next cook after settle marked queued (window simplified:
          // latency already waited; one cook beat = atomic swap for probe).
          textHold = commitHoldSwap(textHold);
          presented = textHold.presented;
          asyncState.presentation = "current";
          asyncState.lastGoodValue = presented;
          asyncState.status = "fresh";
        }

        // Audio cue boundary (edge-trigger on cue input).
        if (mode === "audio" && cue && !lastCue) {
          audioState = onAudioCueBoundary(audioState);
          presented = audioState.playing;
          asyncState.presentation = audioState.presentation;
          asyncState.status = audioState.status;
          asyncState.lastGoodValue = audioState.playing;
        }
        lastCue = cue;

        // Complete GPU fade after window: release slot.
        if (
          (mode === "field" || mode === "geometry") &&
          gpuFadeActive &&
          asyncState.presentation === "fading"
        ) {
          const deltaMs = (ctx.delta > 0 ? ctx.delta : 1 / 60) * 1000;
          // Use signal fade helper as timer only.
          if (!signalFade) {
            signalFade = beginSignalCrossfade(0, 1, arrivalWindowMs);
          }
          const advanced = advanceSignalCrossfade(signalFade, deltaMs);
          signalFade = advanced.state;
          if (signalFade.presentation === "current") {
            sharedGpuFadeQueue.completeFade(id);
            gpuFadeActive = false;
            asyncState.presentation = "current";
            signalFade = undefined;
          } else {
            asyncState.presentation = "fading";
          }
        }

        const needsSchedule =
          generation !== settledGeneration &&
          inflightGeneration !== generation &&
          Number.isFinite(generation);

        if (needsSchedule) {
          loadStarted = true;
          inflightGeneration = generation;
          asyncState.status = "pending";
          asyncState.errorMessage = undefined;
          // Hold lastGoodValue / presented during pending.

          const genAtSchedule = generation;
          const modeAtSchedule = mode;
          const keyAtSchedule = key;
          const payloadAtSchedule = payload;
          const streamChunkAtSchedule = streamChunk;
          const audioPlayingAtSchedule = audioPlaying;
          const windowAtSchedule = arrivalWindowMs;

          schedule(ctx.scheduleDeferred, latencyMs, () => {
            if (inflightGeneration !== genAtSchedule) return; // superseded

            if (modeAtSchedule === "fail") {
              asyncState.status = "error";
              asyncState.errorMessage = `TEST/SyntheticAsync: forced failure gen=${genAtSchedule}`;
              asyncState.presentation = "current";
              // lastGoodValue retained; mark generation settled so we do not loop.
              settledGeneration = genAtSchedule;
              settledCacheKey = keyAtSchedule;
              inflightGeneration = undefined;
              instance.dirty = true;
              return;
            }

            const nextValue =
              modeAtSchedule === "signal"
                ? Number(payloadAtSchedule) || genAtSchedule
                : modeAtSchedule === "text-stream" ||
                    modeAtSchedule === "text-replace"
                  ? payloadAtSchedule
                  : modeAtSchedule === "audio"
                    ? `audio:${payloadAtSchedule || genAtSchedule}`
                    : modeAtSchedule === "field"
                      ? { kind: "field", token: `field:${genAtSchedule}` }
                      : { kind: "geometry", token: `geom:${genAtSchedule}` };

            asyncState.status = "fresh";
            settledGeneration = genAtSchedule;
            settledCacheKey = keyAtSchedule;
            inflightGeneration = undefined;

            switch (modeAtSchedule) {
              case "signal": {
                const from =
                  typeof presented === "number"
                    ? presented
                    : typeof asyncState.lastGoodValue === "number"
                      ? asyncState.lastGoodValue
                      : 0;
                const to = Number(nextValue);
                if (asyncState.lastGoodValue === undefined && presented === undefined) {
                  presented = to;
                  asyncState.lastGoodValue = to;
                  asyncState.presentation = "current";
                  signalFade = undefined;
                } else {
                  signalFade = beginSignalCrossfade(from, to, windowAtSchedule);
                  presented = from;
                  asyncState.presentation = "fading";
                  // lastGoodValue updates only when fade completes
                }
                break;
              }
              case "text-stream": {
                const base =
                  typeof presented === "string"
                    ? presented
                    : typeof asyncState.lastGoodValue === "string"
                      ? (asyncState.lastGoodValue as string)
                      : "";
                // Initial payload is the stream seed; chunk may append.
                const withPayload =
                  base.length === 0 ? String(nextValue) : base + String(nextValue);
                const withChunk =
                  streamChunkAtSchedule.length > 0
                    ? textStreamAppend(withPayload, streamChunkAtSchedule)
                    : withPayload;
                presented = withChunk;
                asyncState.lastGoodValue = withChunk;
                asyncState.presentation = "current";
                break;
              }
              case "text-replace": {
                textHold = beginHoldSwap(textHold, String(nextValue));
                presented = textHold.presented;
                asyncState.presentation = textHold.presentation;
                asyncState.lastGoodValue =
                  textHold.presentation === "current"
                    ? textHold.presented
                    : asyncState.lastGoodValue ?? textHold.presented;
                // If first value, already current; if queued, next cook commits.
                if (textHold.presentation === "current") {
                  asyncState.lastGoodValue = textHold.presented;
                }
                break;
              }
              case "audio": {
                audioState = onAudioFresh(
                  audioState,
                  String(nextValue),
                  audioPlayingAtSchedule,
                );
                presented = audioState.playing;
                asyncState.presentation = audioState.presentation;
                asyncState.lastGoodValue = audioState.playing;
                break;
              }
              case "field":
              case "geometry": {
                const token = `${modeAtSchedule}:${genAtSchedule}`;
                const slot = sharedGpuFadeQueue.requestFade(id, token);
                if (slot === "started") {
                  gpuFadeActive = true;
                  if (asyncState.lastGoodValue === undefined) {
                    presented = nextValue;
                    asyncState.lastGoodValue = nextValue;
                    asyncState.presentation = "current";
                    // First draw is not a crossfade — release slot immediately.
                    sharedGpuFadeQueue.completeFade(id);
                    gpuFadeActive = false;
                  } else {
                    // Dual-resource fade: present new while marking fading.
                    asyncState.presentation = "fading";
                    asyncState.lastGoodValue = nextValue;
                    presented = nextValue;
                    signalFade = beginSignalCrossfade(0, 1, windowAtSchedule);
                  }
                } else {
                  // Queued: status may be fresh while presentation queued (§7.1).
                  gpuFadeActive = false;
                  asyncState.presentation = "queued";
                  asyncState.lastGoodValue = nextValue;
                  // Do not snap presented until slot starts — hold prior presented.
                }
                break;
              }
              default:
                break;
            }

            instance.dirty = true;
          });
        }

        // Post-queue promotion: if field/geometry was queued and now active.
        if (
          (mode === "field" || mode === "geometry") &&
          asyncState.presentation === "queued" &&
          !gpuFadeActive
        ) {
          const activeTok = sharedGpuFadeQueue.getActiveToken(id);
          if (activeTok) {
            gpuFadeActive = true;
            presented = asyncState.lastGoodValue;
            asyncState.presentation = "fading";
            signalFade = beginSignalCrossfade(0, 1, arrivalWindowMs);
          }
        }

        if (inflightGeneration !== undefined && asyncState.status !== "error") {
          asyncState.status = "pending";
        }

        ctx.setOutput(
          "signal",
          typeof presented === "number" ? presented : 0,
        );
        ctx.setOutput(
          "text",
          typeof presented === "string" ? presented : "",
        );
        ctx.setOutput("media", audioState.playing);
        ctx.setOutput(
          "field",
          mode === "field" ? presented : undefined,
        );
        ctx.setOutput(
          "geometry",
          mode === "geometry" ? presented : undefined,
        );
      },
      dispose(): void {
        if (gpuFadeActive) {
          sharedGpuFadeQueue.completeFade(id);
          gpuFadeActive = false;
        }
        inflightGeneration = undefined;
        signalFade = undefined;
        asyncState.lastGoodValue = undefined;
        asyncState.status = "idle";
        presented = undefined;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
