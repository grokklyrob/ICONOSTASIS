/**
 * @iconostasis/engine — public barrel.
 * M0–M1: contracts, cook, operators, graph JSON, async arrival (architecture.md §17–§18).
 * UI-free and headless-testable; imports nothing from apps/* or editor packages.
 */

export const ENGINE_PACKAGE = "@iconostasis/engine" as const;

export type {
  AsyncPortState,
  AsyncStatus,
  PortSpec,
  PortType,
  Presentation,
  SignalValue,
} from "./types/ports.js";

export type {
  ParamSpec,
  ParamType,
  ParamValue,
} from "./types/params.js";

export type {
  AssetLoader,
  CookContext,
  DeferredScheduler,
  EvaluatorHost,
  FrameTime,
  JsonValue,
  OperatorFactory,
  OperatorFamily,
  OperatorInstance,
} from "./types/operator.js";

export type {
  GraphDocument,
  GraphNode,
  ModulationEdge,
  ModulationMap,
  ParamRef,
  PortRef,
  WireEdge,
} from "./graph/types.js";

export { createGraph } from "./graph/graph.js";
export type { RuntimeGraph } from "./graph/graph.js";
export { assertAcyclic, GraphCycleError } from "./graph/topology.js";
export {
  deserializeGraph,
  serializeGraph,
  graphToJson,
  graphFromJson,
  graphsSemanticallyEqual,
  GraphSerializeError,
  parseFromRef,
  normalizeModulations,
} from "./graph/serialize.js";

export { OperatorRegistry } from "./registry/registry.js";

export { GraphEvaluator } from "./cook/evaluator.js";
export { remapSignal, resolveEffectiveParams } from "./cook/modulation.js";

export {
  registerM0Operators,
  registerM1Operators,
  timeFactory,
  SRC_TIME_TYPE,
  audioInFactory,
  SRC_AUDIO_IN_TYPE,
  lfoFactory,
  SIG_LFO_TYPE,
  evalLfoWave,
  pointCloudFactory,
  GEO_POINT_CLOUD_TYPE,
  bloomFactory,
  FX_BLOOM_TYPE,
  godraysFactory,
  FX_GODRAYS_TYPE,
  chromaticAberrationFactory,
  FX_CHROMATIC_ABERRATION_TYPE,
  grainFactory,
  FX_GRAIN_TYPE,
  vignetteFactory,
  FX_VIGNETTE_TYPE,
  renderFactory,
  OUT_RENDER_TYPE,
  DEFAULT_CLEAR_COLOR,
  syntheticAsyncFactory,
  TEST_SYNTHETIC_ASYNC_TYPE,
  setSyntheticGpuFadeQueue,
  resetSyntheticGpuFadeQueue,
  getSyntheticGpuFadeQueue,
} from "./operators/catalog.js";
export type {
  LfoWaveform,
  PointCloudAsyncView,
  CacheScope,
  SyntheticAsyncView,
  SyntheticMode,
} from "./operators/catalog.js";

export {
  asyncCacheKey,
  parseCacheScope,
} from "./async/cacheScope.js";
export {
  DEFAULT_ARRIVAL_WINDOW_MS,
  AUDIO_IDLE_FADE_IN_MS,
  clamp01,
  crossfadeSignal,
  textStreamAppend,
  beginHoldSwap,
  commitHoldSwap,
  onAudioFresh,
  onAudioCueBoundary,
  beginSignalCrossfade,
  advanceSignalCrossfade,
} from "./async/arrival.js";
export {
  GpuFadeQueue,
  maxConcurrentGpuFades,
} from "./async/gpuFadeQueue.js";

export type {
  DeviceTier,
  ProbeBackend,
  RadiancePassId,
  RadiancePassPolicy,
  TierBudgets,
} from "./tier/types.js";
export {
  POINT_BUDGET_BY_TIER,
  FRAME_TARGET_FPS_BY_TIER,
  budgetsForTier,
  radiancePostForTier,
  isRadiancePassEnabled,
  isBloomHalfRes,
} from "./tier/budgets.js";
export {
  classifyTier,
  runCapabilityProbe,
} from "./tier/probe.js";
export type { ProbeMeasurements, ProbeResult } from "./tier/probe.js";
export { PointGovernor } from "./tier/pointGovernor.js";

export type { AudioFrameSnapshot } from "./audio/types.js";
export {
  bandEnergiesFromSpectrum,
  computeAnalyserLevels,
  logBandEdgesHz,
  smoothToward,
} from "./audio/analyser.js";

export {
  parseSeraphBin,
  encodeSeraphBin,
  SeraphBinParseError,
} from "./assets/seraphBin.js";
export type { SeraphBinData } from "./assets/seraphBin.js";
export { decimatePoints } from "./assets/decimate.js";
export type { GeometryHandle, PointCloudGeometry } from "./assets/geometry.js";
export { isPointCloudGeometry } from "./assets/geometry.js";

export type { BloomPassState } from "./render/bloomPass.js";
export { createBloomPassState, isBloomPassState } from "./render/bloomPass.js";
export type { GodraysPassState } from "./render/godraysPass.js";
export {
  createGodraysPassState,
  isGodraysPassState,
} from "./render/godraysPass.js";
export type { ChromaticAberrationPassState } from "./render/chromaticAberrationPass.js";
export {
  createChromaticAberrationPassState,
  isChromaticAberrationPassState,
} from "./render/chromaticAberrationPass.js";
export type { GrainPassState, GrainMode } from "./render/grainPass.js";
export { createGrainPassState, isGrainPassState } from "./render/grainPass.js";
export type { VignettePassState } from "./render/vignettePass.js";
export {
  createVignettePassState,
  isVignettePassState,
} from "./render/vignettePass.js";
export type { ToneMapCurve } from "./render/toneMap.js";
export { parseToneMapCurve } from "./render/toneMap.js";
export {
  resolveRadianceStack,
  type RadianceStackInputs,
  type EffectiveRadianceStack,
} from "./render/radianceStack.js";
export type { RenderBackend, DrawPointsCall } from "./render/backend.js";
export { MockRenderBackend } from "./render/backend.js";
export {
  ThreeWebGLBackend,
  type ThreeWebGLBackendOptions,
} from "./render/threeWebGLBackend.js";
export {
  applyRiseRateClamp,
  estimateLumaProxy,
  limitedExposureScale,
  DEFAULT_FLASH_LIMITER_CONFIG,
} from "./render/flashLimiter.js";
