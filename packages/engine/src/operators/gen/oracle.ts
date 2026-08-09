/**
 * GEN/Oracle — text generation with streaming arrival (§9.4, §7.1).
 * cook is void; invoke scheduled via GenCookHost (never awaited).
 */

import {
  textStreamAppend,
  beginHoldSwap,
  commitHoldSwap,
  type HoldSwapState,
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

export const GEN_ORACLE_TYPE = "GEN/Oracle" as const;

export interface OracleView {
  status: AsyncPortState["status"];
  presentation: AsyncPortState["presentation"];
  lastGoodValue: unknown;
  errorMessage?: string;
  presented: string;
  cacheKey?: string;
}

export const oracleFactory: OperatorFactory = {
  type: GEN_ORACLE_TYPE,
  family: "GEN",
  inputs: [
    { id: "prompt", type: "text", label: "prompt" },
    { id: "event", type: "event", label: "trigger event" },
    { id: "signal", type: "signal", label: "threshold signal" },
  ],
  outputs: [
    { id: "text", type: "text" },
    { id: "complete", type: "event" },
  ],
  params: [...GEN_ASYNC_COMMON_PARAMS],
  create(id, params): OperatorInstance & { oracleView: OracleView } {
    const asyncState: AsyncPortState<string> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };
    const trigger = createGenTriggerState();
    let presented = "";
    let completePulse = false;
    /**
     * Completion latch. Arrivals resolve *between* cooks, so a pulse written
     * straight to `completePulse` is wiped by the next cook's reset before it
     * is ever emitted — downstream event consumers never see it. Async paths
     * set this instead, and cook drains it into the one-frame pulse.
     */
    let pendingComplete = false;
    let hold: HoldSwapState<string> = {
      presented: undefined,
      pending: undefined,
      status: "idle",
      presentation: "current",
    };
    let cacheKey: string | undefined;
    let settleHoldAt: number | undefined;

    const instance: OperatorInstance & { oracleView: OracleView } = {
      id,
      type: GEN_ORACLE_TYPE,
      family: "GEN",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      get oracleView(): OracleView {
        return {
          status: asyncState.status,
          presentation: asyncState.presentation,
          lastGoodValue: asyncState.lastGoodValue,
          errorMessage: asyncState.errorMessage,
          presented,
          cacheKey,
        };
      },
      getOutput(port) {
        if (port === "text") return presented;
        if (port === "complete") return completePulse;
        throw new Error(`GEN/Oracle: unknown port "${port}"`);
      },
      cook(ctx) {
        // Drain any completion latched since the last cook.
        completePulse = pendingComplete;
        pendingComplete = false;
        const p = readGenCommonParams((k) => ctx.getParam(k));
        const wiredPrompt = ctx.getInput("prompt");
        const prompt =
          typeof wiredPrompt === "string" && wiredPrompt.length > 0
            ? wiredPrompt
            : "";
        const eventIn = Boolean(ctx.getInput("event"));
        const signalIn = asSignal(ctx.getInput("signal"), 0);
        const nowMs = ctx.time * 1000;

        // Hold-swap commit window for non-stream replacement
        if (
          settleHoldAt !== undefined &&
          hold.pending !== undefined &&
          nowMs >= settleHoldAt
        ) {
          hold = commitHoldSwap(hold);
          presented = hold.presented ?? "";
          asyncState.presentation = "current";
          asyncState.lastGoodValue = presented;
          settleHoldAt = undefined;
          completePulse = true;
        }

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
          cacheKey = asyncCacheKey(
            id,
            parseCacheScope(p.cacheScope),
            p.stationId,
            prompt.slice(0, 64),
          );

          if (p.stream) {
            // Stream: clear presented for append-only growth of new generation
            // only if no lastGood — else keep lastGood visible until first delta
            // Spec: append-only IS arrival; start fresh stream from empty for new invoke
            presented = "";
            asyncState.presentation = "current";
          }

          const stream = p.stream;
          const cap = stream ? "text.stream" : "text.generate";
          const signal = trigger.abort.signal;

          void host
            .invoke({
              opId: id,
              providerInstanceId: p.providerInstanceId,
              cap,
              prompt,
              system: p.system || undefined,
              maxTokens: p.maxTokens,
              temperature: p.temperature,
              seed: p.seed || undefined,
              model: p.model || undefined,
              signal,
              onDelta: stream
                ? (chunk) => {
                    presented = textStreamAppend(presented, chunk);
                    asyncState.status = "fresh";
                    asyncState.presentation = "current";
                    asyncState.lastGoodValue = presented;
                  }
                : undefined,
            })
            .then((result) => {
              if (signal.aborted) return;
              trigger.inflight = false;
              if (result.status === "ok") {
                const text = result.text ?? presented;
                if (stream) {
                  presented = text;
                  asyncState.status = "fresh";
                  asyncState.presentation = "current";
                  asyncState.lastGoodValue = presented;
                  pendingComplete = true;
                } else {
                  // Replacement hold-then-swap
                  hold = beginHoldSwap(
                    {
                      presented:
                        asyncState.lastGoodValue !== undefined
                          ? String(asyncState.lastGoodValue)
                          : presented || undefined,
                      pending: undefined,
                      status: "idle",
                      presentation: "current",
                    },
                    text,
                  );
                  if (hold.presentation === "current") {
                    presented = text;
                    asyncState.lastGoodValue = text;
                    asyncState.status = "fresh";
                    pendingComplete = true;
                  } else {
                    asyncState.status = "fresh";
                    asyncState.presentation = "queued";
                    settleHoldAt = nowMs + 200;
                  }
                }
              } else {
                asyncState.status = "error";
                asyncState.errorMessage =
                  result.errorMessage ?? result.status;
                // retain lastGood
                if (asyncState.lastGoodValue !== undefined) {
                  presented = String(asyncState.lastGoodValue);
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
          asyncState.errorMessage =
            "GEN host not wired (player path or missing GenCookHost)";
        } else if (start && prompt.length === 0) {
          asyncState.status = "error";
          asyncState.errorMessage = "GEN/Oracle: empty prompt";
        }

        ctx.setOutput("text", presented);
        ctx.setOutput("complete", completePulse);
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
