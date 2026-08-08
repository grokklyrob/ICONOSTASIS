/**
 * OUT/Render — pull sink, built-in points draw, bloom consume, flash limiter
 * (architecture.md §8.1–§8.2, §16.4, Appendix A, §18 M0).
 *
 * M0 composition bridge: draws GEO/PointCloud geometry directly (no Assemble /
 * MAT yet). Port name `geometry` is frozen for M1 replacement without migration.
 *
 * Flash limiter is always on — rise-rate clamp is real, not a pass-through.
 */

import {
  isPointCloudGeometry,
  type PointCloudGeometry,
} from "../../assets/geometry.js";
import {
  isBloomPassState,
  type BloomPassState,
  createBloomPassState,
} from "../../render/bloomPass.js";
import {
  applyRiseRateClamp,
  DEFAULT_FLASH_LIMITER_CONFIG,
  estimateLumaProxy,
  limitedExposureScale,
  type FlashLimiterState,
} from "../../render/flashLimiter.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";

export const OUT_RENDER_TYPE = "OUT/Render" as const;

/** Crypt-void clear (§5.1). */
export const DEFAULT_CLEAR_COLOR = "#0d0d14";

export const renderFactory: OperatorFactory = {
  type: OUT_RENDER_TYPE,
  family: "OUT",
  inputs: [
    // Frozen port name — M1 MAT/Assemble must still feed this inlet.
    { id: "geometry", type: "geometry" },
    { id: "bloom", type: "field", label: "bloom (optional)" },
  ],
  outputs: [],
  params: [
    {
      id: "fov",
      type: "float",
      default: 50,
      min: 10,
      max: 120,
      modulatable: false,
      exposable: true,
      unit: "deg",
    },
    {
      id: "exposure",
      type: "float",
      default: 1,
      min: 0,
      max: 4,
      modulatable: true,
      exposable: true,
    },
    {
      id: "clearColor",
      type: "color",
      default: DEFAULT_CLEAR_COLOR,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    const flashState: FlashLimiterState = { prevLuma: 0 };

    const instance: OperatorInstance = {
      id,
      type: OUT_RENDER_TYPE,
      family: "OUT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(): unknown {
        return undefined;
      },
      cook(ctx): void {
        const backend = ctx.renderBackend;
        const exposure = Number(ctx.getParam("exposure"));
        const clearColor = String(
          ctx.getParam("clearColor") ?? DEFAULT_CLEAR_COLOR,
        );
        const safeExposure = Number.isFinite(exposure) ? exposure : 1;

        const geomRaw = ctx.getInput("geometry");
        const bloomRaw = ctx.getInput("bloom");

        const geometry: PointCloudGeometry | undefined = isPointCloudGeometry(
          geomRaw,
        )
          ? geomRaw
          : undefined;

        const bloom: BloomPassState = isBloomPassState(bloomRaw)
          ? bloomRaw
          : createBloomPassState({ enabled: false, strength: 0 });

        // --- Flash limiter (always on) §16.4 rise-rate damper ---
        const targetLuma = estimateLumaProxy({
          exposure: safeExposure,
          bloomStrength: bloom.enabled ? bloom.strength : 0,
          hasGeometry: geometry !== undefined,
        });
        const limitedLuma = applyRiseRateClamp(
          flashState.prevLuma,
          targetLuma,
          ctx.delta,
          DEFAULT_FLASH_LIMITER_CONFIG,
        );
        flashState.prevLuma = limitedLuma;
        const scale = limitedExposureScale(targetLuma, limitedLuma);
        const limitedExposure = safeExposure * scale;
        const limitedBloom: BloomPassState = {
          ...bloom,
          strength: bloom.strength * scale,
        };

        if (!backend) {
          // Headless / no GPU host: still ran the limiter (state advanced).
          return;
        }

        backend.beginFrame(clearColor);

        if (geometry) {
          backend.drawPoints({
            geometry,
            exposure: limitedExposure,
          });
        }

        if (limitedBloom.enabled) {
          backend.applyBloom(limitedBloom);
        }

        backend.endFrame();
      },
      dispose(): void {
        flashState.prevLuma = 0;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
