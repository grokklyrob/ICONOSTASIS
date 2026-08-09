/**
 * GEN/Antiphon — TTS → media(audio) with queue-to-cue arrival (§9.4, §7.1).
 */

import {
  onAudioCueBoundary,
  onAudioFresh,
  type AudioArrivalState,
} from "../../async/arrival.js";
import { asyncCacheKey, parseCacheScope } from "../../async/cacheScope.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { AsyncPortState } from "../../types/ports.js";
import { asSignal } from "../shared/paramUtils.js";
import {
  createGenTriggerState,
  GEN_ASYNC_COMMON_PARAMS,
  readGenCommonParams,
  shouldStartInvoke,
} from "./genShared.js";

export const GEN_ANTIPHON_TYPE = "GEN/Antiphon" as const;

export interface GenAudioHandle {
  kind: "gen-audio";
  mime: string;
  bytes: ArrayBuffer;
  text: string;
  token: string;
}

export function isGenAudioHandle(v: unknown): v is GenAudioHandle {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as GenAudioHandle).kind === "gen-audio"
  );
}

export interface AntiphonView {
  status: AsyncPortState["status"];
  presentation: AsyncPortState["presentation"];
  lastGoodValue: unknown;
  errorMessage?: string;
  playing?: string;
  queued?: string;
}

export const antiphonFactory: OperatorFactory = {
  type: GEN_ANTIPHON_TYPE,
  family: "GEN",
  inputs: [
    { id: "text", type: "text" },
    { id: "event", type: "event", label: "trigger" },
    { id: "cue", type: "event", label: "audio cue boundary" },
    { id: "signal", type: "signal" },
  ],
  outputs: [
    { id: "media", type: "media" },
    { id: "complete", type: "event" },
  ],
  params: [
    ...GEN_ASYNC_COMMON_PARAMS.filter((p) => p.id !== "stream"),
    {
      id: "audioPlaying",
      type: "bool",
      default: false,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance & { antiphonView: AntiphonView } {
    const asyncState: AsyncPortState<GenAudioHandle> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };
    const trigger = createGenTriggerState();
    let audio: AudioArrivalState = {
      playing: undefined,
      queued: undefined,
      status: "idle",
      presentation: "current",
    };
    const buffers = new Map<string, GenAudioHandle>();
    let completePulse = false;
    /** Completion latch — see GEN/Oracle: arrivals land between cooks. */
    let pendingComplete = false;
    let lastCue = false;
    let seq = 0;

    const instance: OperatorInstance & { antiphonView: AntiphonView } = {
      id,
      type: GEN_ANTIPHON_TYPE,
      family: "GEN",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      get antiphonView(): AntiphonView {
        return {
          status: asyncState.status,
          presentation: asyncState.presentation,
          lastGoodValue: asyncState.lastGoodValue,
          errorMessage: asyncState.errorMessage,
          playing: audio.playing,
          queued: audio.queued,
        };
      },
      getOutput(port) {
        if (port === "media") {
          const tok = audio.playing;
          return tok ? buffers.get(tok) : undefined;
        }
        if (port === "complete") return completePulse;
        throw new Error(`GEN/Antiphon: unknown port "${port}"`);
      },
      cook(ctx) {
        completePulse = pendingComplete;
        pendingComplete = false;
        const p = readGenCommonParams((k) => ctx.getParam(k));
        const wired = ctx.getInput("text");
        const text = typeof wired === "string" ? wired : "";
        const eventIn = Boolean(ctx.getInput("event"));
        const cue = Boolean(ctx.getInput("cue"));
        const signalIn = asSignal(ctx.getInput("signal"), 0);
        const audioPlaying = Boolean(ctx.getParam("audioPlaying"));
        const nowMs = ctx.time * 1000;
        const host = ctx.genHost;

        // Cue boundary: promote queued audio
        if (cue && !lastCue) {
          audio = onAudioCueBoundary(audio);
          if (audio.playing && buffers.has(audio.playing)) {
            asyncState.lastGoodValue = buffers.get(audio.playing);
            asyncState.presentation = "current";
            completePulse = true;
          }
        }
        lastCue = cue;

        // If not playing, idle promote is handled by onAudioFresh path
        if (!audioPlaying && audio.queued && !audio.playing) {
          audio = onAudioCueBoundary(audio);
        }

        const start = shouldStartInvoke({
          mode: p.triggerMode,
          fireToken: p.fireToken,
          eventIn,
          signalIn,
          threshold: p.threshold,
          minIntervalMs: p.minIntervalMs,
          nowMs,
          state: trigger,
        });

        if (start && host && text.length > 0) {
          trigger.inflight = true;
          trigger.lastInvokeStartMs = nowMs;
          trigger.abort?.abort();
          trigger.abort = new AbortController();
          asyncState.status = "pending";
          asyncState.errorMessage = undefined;
          const signal = trigger.abort.signal;
          void asyncCacheKey(
            id,
            parseCacheScope(p.cacheScope),
            p.stationId,
            text.slice(0, 48),
          );

          void host
            .invoke({
              opId: id,
              providerInstanceId: p.providerInstanceId,
              cap: "speech.synthesize",
              prompt: text,
              model: p.model || undefined,
              signal,
            })
            .then((result) => {
              if (signal.aborted) return;
              trigger.inflight = false;
              if (result.status === "ok" && result.audioBytes) {
                seq += 1;
                const token = `${id}:a${seq}`;
                const handle: GenAudioHandle = {
                  kind: "gen-audio",
                  mime: result.audioMime ?? "audio/mpeg",
                  bytes: result.audioBytes,
                  text,
                  token,
                };
                buffers.set(token, handle);
                audio = onAudioFresh(audio, token, audioPlaying);
                asyncState.status = "fresh";
                asyncState.presentation = audio.presentation;
                if (audio.presentation === "current") {
                  asyncState.lastGoodValue = handle;
                  pendingComplete = true;
                }
              } else {
                asyncState.status = "error";
                asyncState.errorMessage =
                  result.errorMessage ??
                  (result.status === "ok"
                    ? "speech.synthesize returned no bytes"
                    : result.status);
              }
            })
            .catch((err: unknown) => {
              if (signal.aborted) return;
              trigger.inflight = false;
              asyncState.status = "error";
              asyncState.errorMessage =
                err instanceof Error ? err.message : String(err);
            });
        } else if (start && !host) {
          asyncState.status = "error";
          asyncState.errorMessage = "GEN host not wired";
        }

        ctx.setOutput(
          "media",
          audio.playing ? buffers.get(audio.playing) : undefined,
        );
        ctx.setOutput("complete", completePulse);
      },
      dispose() {
        trigger.abort?.abort();
        buffers.clear();
      },
      serialize() {
        return { ...this.params };
      },
    };
    return instance;
  },
};
