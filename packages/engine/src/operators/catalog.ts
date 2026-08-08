/**
 * M0 operator catalog registration (architecture.md §18).
 * Grows as operators land; GEN family is out of scope for M0.
 */

import type { OperatorRegistry } from "../registry/registry.js";
import { timeFactory } from "./src/time.js";
import { audioInFactory } from "./src/audioIn.js";
import { lfoFactory } from "./sig/lfo.js";
import { pointCloudFactory } from "./geo/pointCloud.js";
import { bloomFactory } from "./fx/bloom.js";
import { renderFactory } from "./out/render.js";

/** Register all operators implemented so far for M0. */
export function registerM0Operators(registry: OperatorRegistry): void {
  registry.register(timeFactory);
  registry.register(audioInFactory);
  registry.register(lfoFactory);
  registry.register(pointCloudFactory);
  registry.register(bloomFactory);
  registry.register(renderFactory);
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
export {
  renderFactory,
  OUT_RENDER_TYPE,
  DEFAULT_CLEAR_COLOR,
} from "./out/render.js";
