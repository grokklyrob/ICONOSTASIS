/**
 * Operator contract (architecture.md §7.2, AMD-01).
 * cook(ctx): void — must not return a Promise; evaluator never awaits.
 */

import type { AudioFrameSnapshot } from "../audio/types.js";
import type { RenderBackend } from "../render/backend.js";
import type { PointGovernor } from "../tier/pointGovernor.js";
import type { ProbeResult } from "../tier/probe.js";
import type { DeviceTier } from "../tier/types.js";
import type { ParamSpec, ParamValue } from "./params.js";
import type { PortSpec } from "./ports.js";

export type OperatorFamily =
  | "SRC"
  | "SIG"
  | "GEN"
  | "GEO"
  | "MAT"
  | "FX"
  | "LIT"
  | "OUT";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Host-provided asset fetch for async loaders (GEO/PointCloud). */
export type AssetLoader = (path: string) => Promise<ArrayBuffer>;

/**
 * Schedule work after cook returns (AMD-01).
 * Tests inject a flushable queue; hosts may use setTimeout.
 */
export type DeferredScheduler = (fn: () => void, delayMs: number) => void;

export interface CookContext {
  time: number;
  delta: number;
  frame: number;
  /**
   * Optional host-provided audio analyser snapshot for SRC/AudioIn (§11.1).
   * Undefined / inactive → zeros. Never populated by cook itself.
   */
  audio?: AudioFrameSnapshot;
  /**
   * Optional host asset loader. Async ops schedule I/O via this and must not
   * return a Promise from cook (AMD-01).
   */
  loadAsset?: AssetLoader;
  /** Optional GPU/mock render backend for OUT/Render. */
  renderBackend?: RenderBackend;
  /**
   * Optional deferred scheduler for async settle (TEST/SyntheticAsync, future GEN).
   * Must not be awaited by cook — fire-and-forget only (AMD-01).
   */
  scheduleDeferred?: DeferredScheduler;
  /**
   * Optional scene-total point governor (§8.4). Emitters request; loaders
   * decimate to the granted count. Absent → op-local maxPoints only (M0 path).
   */
  pointGovernor?: PointGovernor;
  /** Optional measured (or preview) capability probe result for this session. */
  probeResult?: ProbeResult;
  /** Convenience: probeResult.tier when present. */
  deviceTier?: DeviceTier;
  /** Read a wired input port value (upstream last output). */
  getInput(port: string): unknown;
  /**
   * Effective param value after modulation overlay.
   * Base serialized params are not mutated by modulation (AMD-14).
   */
  getParam(id: string): ParamValue;
  /** Base (unmodulated) param as stored on the instance. */
  getBaseParam(id: string): ParamValue | undefined;
  /** Write an output port for this cook. */
  setOutput(port: string, value: unknown): void;
}

/** Optional host bindings for the evaluator (demo shell / tests). */
export interface EvaluatorHost {
  loadAsset?: AssetLoader;
  renderBackend?: RenderBackend;
  scheduleDeferred?: DeferredScheduler;
  pointGovernor?: PointGovernor;
  probeResult?: ProbeResult;
}

/**
 * Runtime instance of an operator in a graph.
 * cook MUST return void — never a Promise (AMD-01 / §7.1).
 */
export interface OperatorInstance {
  readonly id: string;
  readonly type: string;
  readonly family: OperatorFamily;
  /** Base params (serialize source). Modulation never writes here. */
  params: Record<string, ParamValue>;
  dirty: boolean;
  /**
   * When true, the evaluator keeps the op dirty every frame
   * (e.g. OUT/Render, live SRC/Time).
   */
  alwaysDirty?: boolean;
  cook(ctx: CookContext): void;
  dispose(): void;
  serialize(): JsonValue;
  getOutput(port: string): unknown;
}

export interface OperatorFactory {
  readonly type: string;
  readonly family: OperatorFamily;
  readonly inputs: readonly PortSpec[];
  readonly outputs: readonly PortSpec[];
  readonly params: readonly ParamSpec[];
  create(id: string, params: Record<string, ParamValue>): OperatorInstance;
}

/** Frame clock (+ optional audio) supplied by the host (demo shell or test). */
export interface FrameTime {
  time: number;
  delta: number;
  frame: number;
  /** Injected analyser snapshot for this frame (§11.1). */
  audio?: AudioFrameSnapshot;
}
