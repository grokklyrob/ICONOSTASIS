/**
 * Operator catalog registration (architecture.md §18, Appendix A).
 * M2b: GEN family registered via registerM2Operators.
 */

import type { OperatorRegistry } from "../registry/registry.js";
import { timeFactory } from "./src/time.js";
import { audioInFactory } from "./src/audioIn.js";
import { inputFactory } from "./src/input.js";
import { midiFactory } from "./src/midi.js";
import { seedFactory } from "./src/seed.js";
import { lfoFactory } from "./sig/lfo.js";
import { envelopeFactory } from "./sig/envelope.js";
import { mathFactory } from "./sig/math.js";
import { smoothFactory } from "./sig/smooth.js";
import { logicFactory } from "./sig/logic.js";
import { noiseFactory } from "./sig/noise.js";
import { pointCloudFactory } from "./geo/pointCloud.js";
import { primitiveFactory } from "./geo/primitive.js";
import { instancerFactory } from "./geo/instancer.js";
import { sdfFieldFactory } from "./geo/sdfField.js";
import { particlesFactory } from "./geo/particles.js";
import { glyphFactory } from "./geo/glyph.js";
import { pointsMaterialFactory } from "./mat/pointsMaterial.js";
import { goldLeafPbrFactory } from "./mat/goldLeafPbr.js";
import { haloFactory } from "./mat/halo.js";
import { customShaderFactory } from "./mat/customShader.js";
import { bloomFactory } from "./fx/bloom.js";
import { godraysFactory } from "./fx/godrays.js";
import { chromaticAberrationFactory } from "./fx/chromaticAberration.js";
import { grainFactory } from "./fx/grain.js";
import { vignetteFactory } from "./fx/vignette.js";
import { feedbackFactory } from "./fx/feedback.js";
import { captionFactory } from "./lit/caption.js";
import { choiceFactory } from "./lit/choice.js";
import { renderFactory } from "./out/render.js";
import { audioOutFactory } from "./out/audioOut.js";
import { syntheticAsyncFactory } from "./test/syntheticAsync.js";
import { promptLoomFactory } from "./gen/promptLoom.js";
import { oracleFactory } from "./gen/oracle.js";
import { iconFactory } from "./gen/icon.js";
import { antiphonFactory } from "./gen/antiphon.js";

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
 * Full non-GEN catalog + M1 probe (TEST/SyntheticAsync is not in net-31).
 * Net-31 = SRC5 + SIG6 + GEO6 + MAT4 + FX6 + LIT2 + OUT2.
 */
export function registerM1Operators(registry: OperatorRegistry): void {
  // SRC (5)
  registry.register(timeFactory);
  registry.register(audioInFactory);
  registry.register(inputFactory);
  registry.register(midiFactory);
  registry.register(seedFactory);
  // SIG (6)
  registry.register(lfoFactory);
  registry.register(envelopeFactory);
  registry.register(mathFactory);
  registry.register(smoothFactory);
  registry.register(logicFactory);
  registry.register(noiseFactory);
  // GEO (6)
  registry.register(pointCloudFactory);
  registry.register(primitiveFactory);
  registry.register(instancerFactory);
  registry.register(sdfFieldFactory);
  registry.register(particlesFactory);
  registry.register(glyphFactory);
  // MAT (4)
  registry.register(pointsMaterialFactory);
  registry.register(goldLeafPbrFactory);
  registry.register(haloFactory);
  registry.register(customShaderFactory);
  // FX (6)
  registry.register(bloomFactory);
  registry.register(godraysFactory);
  registry.register(chromaticAberrationFactory);
  registry.register(grainFactory);
  registry.register(vignetteFactory);
  registry.register(feedbackFactory);
  // LIT (2)
  registry.register(captionFactory);
  registry.register(choiceFactory);
  // OUT (2)
  registry.register(renderFactory);
  registry.register(audioOutFactory);
  // Probe (not net-31)
  registry.register(syntheticAsyncFactory);
}

/**
 * M1 catalog + GEN family (M2b).
 * Net catalog grows by 4 GEN ops; player must not wire GenCookHost.
 */
export function registerM2Operators(registry: OperatorRegistry): void {
  registerM1Operators(registry);
  registry.register(promptLoomFactory);
  registry.register(oracleFactory);
  registry.register(iconFactory);
  registry.register(antiphonFactory);
}

export { timeFactory, SRC_TIME_TYPE } from "./src/time.js";
export { audioInFactory, SRC_AUDIO_IN_TYPE } from "./src/audioIn.js";
export { inputFactory, SRC_INPUT_TYPE } from "./src/input.js";
export { midiFactory, SRC_MIDI_TYPE } from "./src/midi.js";
export { seedFactory, SRC_SEED_TYPE } from "./src/seed.js";
export { lfoFactory, SIG_LFO_TYPE, evalLfoWave } from "./sig/lfo.js";
export type { LfoWaveform } from "./sig/lfo.js";
export { envelopeFactory, SIG_ENVELOPE_TYPE } from "./sig/envelope.js";
export { mathFactory, SIG_MATH_TYPE, evalMath } from "./sig/math.js";
export type { MathOp } from "./sig/math.js";
export { smoothFactory, SIG_SMOOTH_TYPE, smoothStep } from "./sig/smooth.js";
export { logicFactory, SIG_LOGIC_TYPE } from "./sig/logic.js";
export type { LogicOp } from "./sig/logic.js";
export { noiseFactory, SIG_NOISE_TYPE, valueNoise1D, hash01 } from "./sig/noise.js";
export {
  pointCloudFactory,
  GEO_POINT_CLOUD_TYPE,
} from "./geo/pointCloud.js";
export type { PointCloudAsyncView, CacheScope } from "./geo/pointCloud.js";
export { primitiveFactory, GEO_PRIMITIVE_TYPE } from "./geo/primitive.js";
export { instancerFactory, GEO_INSTANCER_TYPE } from "./geo/instancer.js";
export { sdfFieldFactory, GEO_SDF_FIELD_TYPE } from "./geo/sdfField.js";
export { particlesFactory, GEO_PARTICLES_TYPE } from "./geo/particles.js";
export { glyphFactory, GEO_GLYPH_TYPE } from "./geo/glyph.js";
export {
  pointsMaterialFactory,
  MAT_POINTS_MATERIAL_TYPE,
} from "./mat/pointsMaterial.js";
export {
  goldLeafPbrFactory,
  MAT_GOLD_LEAF_PBR_TYPE,
} from "./mat/goldLeafPbr.js";
export { haloFactory, MAT_HALO_TYPE } from "./mat/halo.js";
export {
  customShaderFactory,
  MAT_CUSTOM_SHADER_TYPE,
} from "./mat/customShader.js";
export { bloomFactory, FX_BLOOM_TYPE } from "./fx/bloom.js";
export { godraysFactory, FX_GODRAYS_TYPE } from "./fx/godrays.js";
export {
  chromaticAberrationFactory,
  FX_CHROMATIC_ABERRATION_TYPE,
} from "./fx/chromaticAberration.js";
export { grainFactory, FX_GRAIN_TYPE } from "./fx/grain.js";
export { vignetteFactory, FX_VIGNETTE_TYPE } from "./fx/vignette.js";
export { feedbackFactory, FX_FEEDBACK_TYPE } from "./fx/feedback.js";
export { captionFactory, LIT_CAPTION_TYPE } from "./lit/caption.js";
export { choiceFactory, LIT_CHOICE_TYPE } from "./lit/choice.js";
export {
  renderFactory,
  OUT_RENDER_TYPE,
  DEFAULT_CLEAR_COLOR,
} from "./out/render.js";
export { audioOutFactory, OUT_AUDIO_OUT_TYPE } from "./out/audioOut.js";
export type { AudioOutState } from "./out/audioOut.js";
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
export {
  promptLoomFactory,
  GEN_PROMPT_LOOM_TYPE,
  fillPromptTemplate,
  formatSlotValue,
  listTemplateSlots,
} from "./gen/promptLoom.js";
export {
  oracleFactory,
  GEN_ORACLE_TYPE,
} from "./gen/oracle.js";
export type { OracleView } from "./gen/oracle.js";
export {
  iconFactory,
  GEN_ICON_TYPE,
  isGenFieldHandle,
  ICON_STYLE_PRESETS,
} from "./gen/icon.js";
export type { GenFieldHandle, IconView } from "./gen/icon.js";
export {
  antiphonFactory,
  GEN_ANTIPHON_TYPE,
  isGenAudioHandle,
} from "./gen/antiphon.js";
export type { GenAudioHandle, AntiphonView } from "./gen/antiphon.js";
