/**
 * Shared GEN async trigger / interval helpers (§9.4).
 */

import type { ParamValue } from "../../types/params.js";
import { asBool, asFinite, asString } from "../shared/paramUtils.js";

export type TriggerMode = "manual" | "event" | "signalThreshold";

export function parseTriggerMode(raw: unknown): TriggerMode {
  const s = String(raw);
  if (s === "event" || s === "signalThreshold") return s;
  return "manual";
}

export interface GenTriggerState {
  lastFireToken: number;
  lastEvent: boolean;
  lastInvokeStartMs: number;
  inflight: boolean;
  abort: AbortController | null;
}

export function createGenTriggerState(): GenTriggerState {
  return {
    lastFireToken: 0,
    lastEvent: false,
    lastInvokeStartMs: 0,
    inflight: false,
    abort: null,
  };
}

/**
 * Decide whether to start a new invoke this cook.
 * Returns true once per trigger edge / manual token bump.
 */
export function shouldStartInvoke(opts: {
  mode: TriggerMode;
  fireToken: number;
  eventIn: boolean;
  signalIn: number;
  threshold: number;
  minIntervalMs: number;
  nowMs: number;
  state: GenTriggerState;
}): boolean {
  if (opts.state.inflight) return false;

  const elapsed = opts.nowMs - opts.state.lastInvokeStartMs;
  if (
    opts.state.lastInvokeStartMs > 0 &&
    elapsed < Math.max(0, opts.minIntervalMs)
  ) {
    return false;
  }

  let edge = false;
  if (opts.mode === "manual") {
    if (opts.fireToken !== opts.state.lastFireToken && opts.fireToken > 0) {
      edge = true;
      opts.state.lastFireToken = opts.fireToken;
    }
  } else if (opts.mode === "event") {
    if (opts.eventIn && !opts.state.lastEvent) edge = true;
    opts.state.lastEvent = opts.eventIn;
  } else {
    // signalThreshold: rising cross
    const over = opts.signalIn >= opts.threshold;
    if (over && !opts.state.lastEvent) edge = true;
    opts.state.lastEvent = over;
  }
  return edge;
}

/**
 * `stream` is the one common param an op may legitimately not declare: GEN/Icon
 * and GEN/Antiphon are not text-streaming ops and filter it out of their specs.
 * The evaluator throws on an unknown param id, so read it defensively rather
 * than making every non-text GEN op carry a param it ignores.
 */
function readOptionalParam(
  getParam: (id: string) => ParamValue,
  id: string,
): ParamValue | undefined {
  try {
    return getParam(id);
  } catch {
    return undefined;
  }
}

export function readGenCommonParams(getParam: (id: string) => ParamValue): {
  providerInstanceId: string;
  system: string;
  maxTokens: number;
  temperature: number;
  seed: number;
  model: string;
  triggerMode: TriggerMode;
  minIntervalMs: number;
  fireToken: number;
  threshold: number;
  cacheScope: string;
  stationId: string;
  stream: boolean;
} {
  return {
    providerInstanceId: asString(getParam("providerInstanceId"), ""),
    system: asString(getParam("system"), ""),
    maxTokens: Math.max(1, Math.floor(asFinite(getParam("maxTokens"), 256))),
    temperature: asFinite(getParam("temperature"), 0.7),
    seed: Math.floor(asFinite(getParam("seed"), 0)),
    model: asString(getParam("model"), ""),
    triggerMode: parseTriggerMode(getParam("triggerMode")),
    minIntervalMs: Math.max(0, asFinite(getParam("minIntervalMs"), 1000)),
    fireToken: Math.floor(asFinite(getParam("fire"), 0)),
    threshold: asFinite(getParam("threshold"), 0.5),
    cacheScope: asString(getParam("cacheScope"), "station"),
    stationId: asString(getParam("stationId"), "default"),
    stream: asBool(readOptionalParam(getParam, "stream"), true),
  };
}

/** Shared param specs for async GEN ops. */
export const GEN_ASYNC_COMMON_PARAMS = [
  {
    id: "providerInstanceId",
    type: "string" as const,
    default: "",
    modulatable: false,
    exposable: true,
  },
  {
    id: "system",
    type: "text" as const,
    default: "",
    modulatable: false,
    exposable: true,
  },
  {
    id: "maxTokens",
    type: "int" as const,
    default: 256,
    min: 1,
    max: 8192,
    modulatable: false,
    exposable: true,
  },
  {
    id: "temperature",
    type: "float" as const,
    default: 0.7,
    min: 0,
    max: 2,
    step: 0.05,
    modulatable: true,
    exposable: true,
  },
  {
    id: "seed",
    type: "seed" as const,
    default: 0,
    modulatable: false,
    exposable: true,
  },
  {
    id: "model",
    type: "string" as const,
    default: "",
    modulatable: false,
    exposable: true,
  },
  {
    id: "triggerMode",
    type: "enum" as const,
    default: "manual",
    enumValues: ["manual", "event", "signalThreshold"],
    modulatable: false,
    exposable: true,
  },
  {
    id: "fire",
    type: "int" as const,
    default: 0,
    min: 0,
    modulatable: true,
    exposable: true,
  },
  {
    id: "threshold",
    type: "float" as const,
    default: 0.5,
    min: 0,
    max: 1,
    modulatable: true,
    exposable: true,
  },
  {
    id: "minIntervalMs",
    type: "float" as const,
    default: 1000,
    min: 0,
    modulatable: false,
    exposable: false,
  },
  {
    id: "cacheScope",
    type: "enum" as const,
    default: "station",
    enumValues: ["station", "global"],
    modulatable: false,
    exposable: false,
  },
  {
    id: "stationId",
    type: "string" as const,
    default: "default",
    modulatable: false,
    exposable: false,
  },
  {
    id: "stream",
    type: "bool" as const,
    default: true,
    modulatable: false,
    exposable: true,
  },
] as const;
