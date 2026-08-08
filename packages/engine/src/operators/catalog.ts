/**
 * Operator catalog registration (architecture.md §18).
 * M0 six + M1 growth; GEN family remains out of scope until M2.
 */

import type { OperatorRegistry } from "../registry/registry.js";
import { timeFactory } from "./src/time.js";
import { audioInFactory } from "./src/audioIn.js";
import { lfoFactory } from "./sig/lfo.js";
import { pointCloudFactory } from "./geo/pointCloud.js";
import { bloomFactory } from "./fx/bloom.js";
import { godraysFactory } from "./fx/godrays.js";
import { chromaticAberrationFactory } from "./fx/chromaticAberration.js";
import { grainFactory } from "./fx/grain.js";
import { vignetteFactory } from "./fx/vignette.js";
import { renderFactory } from "./out/render.js";
import { syntheticAsyncFactory } from "./test/syntheticAsync.js";

/** Register M0 six operators (seraph demo / regression baseline). */
export function registerM0Operators(registry: OperatorRegistry): void {
  registry.register(timeFactory);
  registry.register(audioInFactory);
  registry.register(lfoFactory);
  registry.register(pointCloudFactory);
  registry.register(bloomFactory);
  registry.register(renderFactory);
}

/**
 * M0 + M1 operators landed so far (TEST/SyntheticAsync is not in net-31).
 * Radiance FX: Bloom (M0), Godrays, ChromaticAberration, Grain, Vignette.
 */
export function registerM1Operators(registry: OperatorRegistry): void {
  registerM0Operators(registry);
  registry.register(godraysFactory);
  registry.register(chromaticAberrationFactory);
  registry.register(grainFactory);
  registry.register(vignetteFactory);
  registry.register(syntheticAsyncFactory);
}

export { timeFactory, SRC_TIME_TYPE } from "./src/time.js";
export { audioInFactory, SRC_AUDIO_IN_TYPE } from "./src/audioIn.js";
export { lfoFactory, SIG_LFO_TYPE, evalLfoWave } from "./sig/lfo.js";
export type { LfoWaveform } from "./sig/lfo.js";
export {
  pointCloudFactory,
  GEO_POINT_CLOUD_TYPE,
} from "./geo/pointCloud.js";
export type { PointCloudAsyncView, CacheScope } from "./geo/pointCloud.js";
export { bloomFactory, FX_BLOOM_TYPE } from "./fx/bloom.js";
export { godraysFactory, FX_GODRAYS_TYPE } from "./fx/godrays.js";
export {
  chromaticAberrationFactory,
  FX_CHROMATIC_ABERRATION_TYPE,
} from "./fx/chromaticAberration.js";
export { grainFactory, FX_GRAIN_TYPE } from "./fx/grain.js";
export { vignetteFactory, FX_VIGNETTE_TYPE } from "./fx/vignette.js";
export {
  renderFactory,
  OUT_RENDER_TYPE,
  DEFAULT_CLEAR_COLOR,
} from "./out/render.js";
export {
  syntheticAsyncFactory,
  TEST_SYNTHETIC_ASYNC_TYPE,
  setSyntheticGpuFadeQueue,
  resetSyntheticGpuFadeQueue,
  getSyntheticGpuFadeQueue,
} from "./test/syntheticAsync.js";
export type {
  SyntheticAsyncView,
  SyntheticMode,
} from "./test/syntheticAsync.js";
