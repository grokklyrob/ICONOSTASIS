/**
 * Render backend abstraction — headless-mockable (§17, packages/engine UI-free).
 */

import type { PointCloudGeometry } from "../assets/geometry.js";
import type { BloomPassState } from "./bloomPass.js";
import type { ChromaticAberrationPassState } from "./chromaticAberrationPass.js";
import type { GodraysPassState } from "./godraysPass.js";
import type { GrainPassState } from "./grainPass.js";
import type { ToneMapCurve } from "./toneMap.js";
import type { VignettePassState } from "./vignettePass.js";

export interface DrawPointsCall {
  geometry: PointCloudGeometry;
  /** Exposure after flash-limiter scale. */
  exposure: number;
}

export interface RenderBackend {
  beginFrame(clearColor: string): void;
  drawPoints(call: DrawPointsCall): void;
  applyBloom(state: BloomPassState): void;
  /** Optional Radiance Stack passes — backends may no-op if unsupported. */
  applyGodrays?(state: GodraysPassState): void;
  applyChromaticAberration?(state: ChromaticAberrationPassState): void;
  applyGrain?(state: GrainPassState, timeSeconds: number): void;
  applyVignette?(state: VignettePassState): void;
  applyToneMap?(curve: ToneMapCurve): void;
  endFrame(): void;
  dispose(): void;
}

/** Recording backend for headless tests. */
export class MockRenderBackend implements RenderBackend {
  readonly frames: Array<{
    clearColor: string;
    draws: DrawPointsCall[];
    blooms: BloomPassState[];
    godrays: GodraysPassState[];
    chromaticAberrations: ChromaticAberrationPassState[];
    grains: GrainPassState[];
    vignettes: VignettePassState[];
    toneMaps: ToneMapCurve[];
  }> = [];

  private current: {
    clearColor: string;
    draws: DrawPointsCall[];
    blooms: BloomPassState[];
    godrays: GodraysPassState[];
    chromaticAberrations: ChromaticAberrationPassState[];
    grains: GrainPassState[];
    vignettes: VignettePassState[];
    toneMaps: ToneMapCurve[];
  } | null = null;

  beginFrame(clearColor: string): void {
    this.current = {
      clearColor,
      draws: [],
      blooms: [],
      godrays: [],
      chromaticAberrations: [],
      grains: [],
      vignettes: [],
      toneMaps: [],
    };
  }

  drawPoints(call: DrawPointsCall): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.drawPoints outside beginFrame");
    }
    this.current.draws.push({
      geometry: call.geometry,
      exposure: call.exposure,
    });
  }

  applyBloom(state: BloomPassState): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.applyBloom outside beginFrame");
    }
    this.current.blooms.push({ ...state });
  }

  applyGodrays(state: GodraysPassState): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.applyGodrays outside beginFrame");
    }
    this.current.godrays.push({ ...state });
  }

  applyChromaticAberration(state: ChromaticAberrationPassState): void {
    if (!this.current) {
      throw new Error(
        "MockRenderBackend.applyChromaticAberration outside beginFrame",
      );
    }
    this.current.chromaticAberrations.push({ ...state });
  }

  applyGrain(state: GrainPassState, _timeSeconds: number): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.applyGrain outside beginFrame");
    }
    this.current.grains.push({ ...state });
  }

  applyVignette(state: VignettePassState): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.applyVignette outside beginFrame");
    }
    this.current.vignettes.push({ ...state });
  }

  applyToneMap(curve: ToneMapCurve): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.applyToneMap outside beginFrame");
    }
    this.current.toneMaps.push(curve);
  }

  endFrame(): void {
    if (!this.current) {
      throw new Error("MockRenderBackend.endFrame outside beginFrame");
    }
    this.frames.push(this.current);
    this.current = null;
  }

  dispose(): void {
    this.frames.length = 0;
    this.current = null;
  }

  get lastFrame() {
    return this.frames[this.frames.length - 1];
  }
}
