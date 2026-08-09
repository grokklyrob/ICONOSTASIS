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

export type {
  GenCapability,
  GenCookHost,
  GenHostRequest,
  GenHostResult,
  GenHostUsage,
} from "./types/genHost.js";

export {
  createEmptyProvenance,
  parseProvenance,
  appendProvenance,
  type ProvenanceDoc,
  type ProvenanceRecord,
} from "./persist/provenance.js";

export {
  registerM0Operators,
  registerM1Operators,
  registerM2Operators,
  timeFactory,
  SRC_TIME_TYPE,
  audioInFactory,
  SRC_AUDIO_IN_TYPE,
  inputFactory,
  SRC_INPUT_TYPE,
  midiFactory,
  SRC_MIDI_TYPE,
  seedFactory,
  SRC_SEED_TYPE,
  lfoFactory,
  SIG_LFO_TYPE,
  evalLfoWave,
  envelopeFactory,
  SIG_ENVELOPE_TYPE,
  mathFactory,
  SIG_MATH_TYPE,
  evalMath,
  smoothFactory,
  SIG_SMOOTH_TYPE,
  logicFactory,
  SIG_LOGIC_TYPE,
  noiseFactory,
  SIG_NOISE_TYPE,
  pointCloudFactory,
  GEO_POINT_CLOUD_TYPE,
  primitiveFactory,
  GEO_PRIMITIVE_TYPE,
  instancerFactory,
  GEO_INSTANCER_TYPE,
  sdfFieldFactory,
  GEO_SDF_FIELD_TYPE,
  particlesFactory,
  GEO_PARTICLES_TYPE,
  glyphFactory,
  GEO_GLYPH_TYPE,
  pointsMaterialFactory,
  MAT_POINTS_MATERIAL_TYPE,
  goldLeafPbrFactory,
  MAT_GOLD_LEAF_PBR_TYPE,
  haloFactory,
  MAT_HALO_TYPE,
  customShaderFactory,
  MAT_CUSTOM_SHADER_TYPE,
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
  feedbackFactory,
  FX_FEEDBACK_TYPE,
  captionFactory,
  LIT_CAPTION_TYPE,
  choiceFactory,
  LIT_CHOICE_TYPE,
  renderFactory,
  OUT_RENDER_TYPE,
  DEFAULT_CLEAR_COLOR,
  audioOutFactory,
  OUT_AUDIO_OUT_TYPE,
  syntheticAsyncFactory,
  TEST_SYNTHETIC_ASYNC_TYPE,
  setSyntheticGpuFadeQueue,
  resetSyntheticGpuFadeQueue,
  getSyntheticGpuFadeQueue,
  promptLoomFactory,
  GEN_PROMPT_LOOM_TYPE,
  fillPromptTemplate,
  formatSlotValue,
  listTemplateSlots,
  oracleFactory,
  GEN_ORACLE_TYPE,
  iconFactory,
  GEN_ICON_TYPE,
  isGenFieldHandle,
  ICON_STYLE_PRESETS,
  antiphonFactory,
  GEN_ANTIPHON_TYPE,
  isGenAudioHandle,
} from "./operators/catalog.js";
export type {
  LfoWaveform,
  PointCloudAsyncView,
  CacheScope,
  SyntheticAsyncView,
  SyntheticMode,
  MathOp,
  LogicOp,
  OracleView,
  GenFieldHandle,
  IconView,
  GenAudioHandle,
  AntiphonView,
  AudioOutState,
} from "./operators/catalog.js";

export type {
  InputFrameSnapshot,
  MidiFrameSnapshot,
} from "./types/hostFrames.js";
export {
  EMPTY_INPUT_FRAME,
  EMPTY_MIDI_FRAME,
} from "./types/hostFrames.js";
export type { MaterialHandle, MaterialKind } from "./materials/types.js";
export { isMaterialHandle } from "./materials/types.js";

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

// Persistence — taint gate, .icx, OPFS autosave (§12)
export { sha256Hex, isSha256Hex, isSha256Base64 } from "./persist/hash.js";
export {
  scanForSecrets,
  scanTextForSecrets,
  assertUntainted,
  advisoryHighEntropy,
  TaintGateError,
  type TaintFinding,
  type TaintGateOptions,
} from "./persist/taintGate.js";
export {
  packIcx,
  unpackIcx,
  verifyIcxAssetHashes,
  ensureAssetHashes,
  IcxError,
  createDefaultManifest,
  parseManifest,
  type IcxProject,
  type PackIcxOptions,
  type Manifest,
} from "./persist/icx.js";
export {
  AUTOSAVE_RING_SIZE,
  AutosaveRing,
  MemoryAutosaveStore,
  OpfsAutosaveStore,
  createAutosaveStore,
  type AutosaveMeta,
  type AutosaveStore,
} from "./persist/opfsAutosave.js";
