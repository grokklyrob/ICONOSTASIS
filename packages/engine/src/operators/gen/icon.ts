/**
 * GEN/Icon — image generation → field handle (§9.4).
 * Style-suffix presets; field crossfade deferred to GPU path (handle swap + status).
 */

import { asyncCacheKey, parseCacheScope } from "../../async/cacheScope.js";
import {
  isGenFieldHandle,
  type GenFieldHandle,
} from "../../render/backdropField.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { AsyncPortState } from "../../types/ports.js";
import { asSignal, asString } from "../shared/paramUtils.js";
import {
  createGenTriggerState,
  GEN_ASYNC_COMMON_PARAMS,
  readGenCommonParams,
  shouldStartInvoke,
} from "./genShared.js";

export const GEN_ICON_TYPE = "GEN/Icon" as const;

export const ICON_STYLE_PRESETS: Record<string, string> = {
  none: "",
  "gold-ground":
    ", gold-ground icon, neon rim light, mycelial gothic, liturgical register",
  "crypt-void":
    ", crypt void background, biolume gold accents, KENOSARKOSPORA codex",
  "mycelial":
    ", mycelial gothic ornament, indigo nave light, sacred geometry",
};

// The handle type lives with the render substrate that consumes it — OUT/Render
// and the WebGL backend both need it, and the op is only one producer.
export { isGenFieldHandle, type GenFieldHandle };

export interface IconView {
  status: AsyncPortState["status"];
  presentation: AsyncPortState["presentation"];
  lastGoodValue: unknown;
  errorMessage?: string;
  presented: GenFieldHandle | undefined;
}

export const iconFactory: OperatorFactory = {
  type: GEN_ICON_TYPE,
  family: "GEN",
  inputs: [
    { id: "prompt", type: "text" },
    { id: "init", type: "media", label: "optional init image" },
    { id: "event", type: "event" },
    { id: "signal", type: "signal" },
  ],
  outputs: [{ id: "field", type: "field" }],
  params: [
    ...GEN_ASYNC_COMMON_PARAMS.filter((p) => p.id !== "stream"),
    {
      id: "stylePreset",
      type: "enum",
      default: "gold-ground",
      enumValues: Object.keys(ICON_STYLE_PRESETS),
      modulatable: false,
      exposable: true,
    },
    {
      id: "styleSuffix",
      type: "text",
      default: "",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance & { iconView: IconView } {
    const asyncState: AsyncPortState<GenFieldHandle> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };
    const trigger = createGenTriggerState();
    let presented: GenFieldHandle | undefined;

    const instance: OperatorInstance & { iconView: IconView } = {
      id,
      type: GEN_ICON_TYPE,
      family: "GEN",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      get iconView(): IconView {
        return {
          status: asyncState.status,
          presentation: asyncState.presentation,
          lastGoodValue: asyncState.lastGoodValue,
          errorMessage: asyncState.errorMessage,
          presented,
        };
      },
      getOutput(port) {
        if (port === "field") return presented;
        throw new Error(`GEN/Icon: unknown port "${port}"`);
      },
      cook(ctx) {
        const p = readGenCommonParams((k) => ctx.getParam(k));
        const wired = ctx.getInput("prompt");
        const basePrompt =
          typeof wired === "string" ? wired : "";
        const preset = asString(ctx.getParam("stylePreset"), "gold-ground");
        const customSuffix = asString(ctx.getParam("styleSuffix"), "");
        const presetSuffix = ICON_STYLE_PRESETS[preset] ?? "";
        const prompt = `${basePrompt}${presetSuffix}${customSuffix}`.trim();
        const eventIn = Boolean(ctx.getInput("event"));
        const signalIn = asSignal(ctx.getInput("signal"), 0);
        const nowMs = ctx.time * 1000;
        const host = ctx.genHost;

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

        if (start && host && prompt.length > 0) {
          trigger.inflight = true;
          trigger.lastInvokeStartMs = nowMs;
          trigger.abort?.abort();
          trigger.abort = new AbortController();
          asyncState.status = "pending";
          asyncState.errorMessage = undefined;
          const signal = trigger.abort.signal;
          const key = asyncCacheKey(
            id,
            parseCacheScope(p.cacheScope),
            p.stationId,
            prompt.slice(0, 48),
          );
          void key;

          void host
            .invoke({
              opId: id,
              providerInstanceId: p.providerInstanceId,
              cap: "image.generate",
              prompt,
              maxTokens: p.maxTokens,
              temperature: p.temperature,
              seed: p.seed || undefined,
              model: p.model || undefined,
              signal,
            })
            .then((result) => {
              if (signal.aborted) return;
              trigger.inflight = false;
              if (result.status === "ok" && result.imageBytes) {
                const handle: GenFieldHandle = {
                  kind: "gen-field",
                  mime: result.imageMime ?? "image/png",
                  bytes: result.imageBytes,
                  prompt,
                };
                // Field arrival: hold lastGood during pending; swap on fresh
                // (GPU crossfade is render-backend responsibility)
                presented = handle;
                asyncState.status = "fresh";
                asyncState.presentation = "current";
                asyncState.lastGoodValue = handle;
              } else {
                asyncState.status = "error";
                asyncState.errorMessage =
                  result.errorMessage ??
                  (result.status === "ok"
                    ? "image.generate returned no bytes"
                    : result.status);
                if (asyncState.lastGoodValue) {
                  presented = asyncState.lastGoodValue;
                }
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

        // Present lastGood while pending
        if (asyncState.status === "pending" && asyncState.lastGoodValue) {
          presented = asyncState.lastGoodValue;
        }

        ctx.setOutput("field", presented);
      },
      dispose() {
        trigger.abort?.abort();
      },
      serialize() {
        return { ...this.params };
      },
    };
    return instance;
  },
};
