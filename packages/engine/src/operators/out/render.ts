/**
 * OUT/Render — pull sink, points draw, Radiance Stack, flash limiter
 * (architecture.md §8.1–§8.2, §8.4, §16.4, Appendix A).
 *
 * M0 composition bridge: draws GEO/PointCloud geometry directly (no Assemble /
 * MAT yet). Port name `geometry` and `bloom` are frozen for M1 without migration.
 * Additional Radiance ports: godrays, chromaticAberration, grain, vignette.
 * ToneMap lives here (not a separate FX catalog op).
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
  isChromaticAberrationPassState,
  type ChromaticAberrationPassState,
} from "../../render/chromaticAberrationPass.js";
import {
  isGodraysPassState,
  type GodraysPassState,
} from "../../render/godraysPass.js";
import {
  isGrainPassState,
  type GrainPassState,
} from "../../render/grainPass.js";
import {
  applyRiseRateClamp,
  DEFAULT_FLASH_LIMITER_CONFIG,
  estimateLumaProxy,
  limitedExposureScale,
  type FlashLimiterState,
} from "../../render/flashLimiter.js";
import { resolveRadianceStack } from "../../render/radianceStack.js";
import { parseToneMapCurve } from "../../render/toneMap.js";
import {
  isVignettePassState,
  type VignettePassState,
} from "../../render/vignettePass.js";
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
    // Frozen port names — M1 MAT/Assemble / M0 bloom must still feed these.
    { id: "geometry", type: "geometry" },
    { id: "bloom", type: "field", label: "bloom (optional)" },
    { id: "godrays", type: "field", label: "godrays (optional)" },
    {
      id: "chromaticAberration",
      type: "field",
      label: "chromaticAberration (optional)",
    },
    { id: "grain", type: "field", label: "grain (optional)" },
    { id: "vignette", type: "field", label: "vignette (optional)" },
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
    {
      id: "toneMap",
      type: "enum",
      default: "aces",
      enumValues: ["aces", "goldLeaf"],
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
        const toneMap = parseToneMapCurve(ctx.getParam("toneMap"));

        const geomRaw = ctx.getInput("geometry");
        const bloomRaw = ctx.getInput("bloom");
        const godraysRaw = ctx.getInput("godrays");
        const caRaw = ctx.getInput("chromaticAberration");
        const grainRaw = ctx.getInput("grain");
        const vignetteRaw = ctx.getInput("vignette");

        const geometry: PointCloudGeometry | undefined = isPointCloudGeometry(
          geomRaw,
        )
          ? geomRaw
          : undefined;

        const bloomIn: BloomPassState | undefined = isBloomPassState(bloomRaw)
          ? bloomRaw
          : undefined;
        const godraysIn: GodraysPassState | undefined = isGodraysPassState(
          godraysRaw,
        )
          ? godraysRaw
          : undefined;
        const caIn: ChromaticAberrationPassState | undefined =
          isChromaticAberrationPassState(caRaw) ? caRaw : undefined;
        const grainIn: GrainPassState | undefined = isGrainPassState(grainRaw)
          ? grainRaw
          : undefined;
        const vignetteIn: VignettePassState | undefined = isVignettePassState(
          vignetteRaw,
        )
          ? vignetteRaw
          : undefined;

        const stack = resolveRadianceStack({
          bloom: bloomIn,
          godrays: godraysIn,
          chromaticAberration: caIn,
          grain: grainIn,
          vignette: vignetteIn,
          toneMap,
          tier: ctx.deviceTier,
        });

        // --- Flash limiter (always on) §16.4 rise-rate damper ---
        const bloomForLuma = stack.bloom;
        const targetLuma = estimateLumaProxy({
          exposure: safeExposure,
          bloomStrength:
            bloomForLuma?.enabled === true ? bloomForLuma.strength : 0,
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

        const limitedBloom: BloomPassState | undefined = stack.bloom
          ? {
              ...stack.bloom,
              strength: stack.bloom.strength * scale,
              halfRes: stack.bloomHalfRes,
            }
          : undefined;

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

        // Fixed Radiance order (§8.2).
        if (limitedBloom?.enabled) {
          backend.applyBloom(limitedBloom);
        }
        if (stack.godrays?.enabled && backend.applyGodrays) {
          backend.applyGodrays(stack.godrays);
        }
        if (
          stack.chromaticAberration?.enabled &&
          backend.applyChromaticAberration
        ) {
          backend.applyChromaticAberration(stack.chromaticAberration);
        }
        if (stack.grain?.enabled && backend.applyGrain) {
          backend.applyGrain(stack.grain, ctx.time);
        }
        if (stack.vignette?.enabled && backend.applyVignette) {
          backend.applyVignette(stack.vignette);
        }
        if (backend.applyToneMap) {
          backend.applyToneMap(stack.toneMap);
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
