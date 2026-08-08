/**
 * Render backend abstraction — headless-mockable (§17, packages/engine UI-free).
 * Three.js WebGL implementation lands with the demo shell (Step 6).
 */

import type { PointCloudGeometry } from "../assets/geometry.js";
import type { BloomPassState } from "./bloomPass.js";

export interface DrawPointsCall {
  geometry: PointCloudGeometry;
  /** Exposure after flash-limiter scale. */
  exposure: number;
}

export interface RenderBackend {
  beginFrame(clearColor: string): void;
  drawPoints(call: DrawPointsCall): void;
  applyBloom(state: BloomPassState): void;
  endFrame(): void;
  dispose(): void;
}

/** Recording backend for headless tests. */
export class MockRenderBackend implements RenderBackend {
  readonly frames: Array<{
    clearColor: string;
    draws: DrawPointsCall[];
    blooms: BloomPassState[];
  }> = [];

  private current: {
    clearColor: string;
    draws: DrawPointsCall[];
    blooms: BloomPassState[];
  } | null = null;

  beginFrame(clearColor: string): void {
    this.current = { clearColor, draws: [], blooms: [] };
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
