/**
 * Radiance Stack FX ops — cook publishes pass states (AGENTS.md colocated).
 */
import { describe, expect, it } from "vitest";
import { isChromaticAberrationPassState } from "../../render/chromaticAberrationPass.js";
import { isGodraysPassState } from "../../render/godraysPass.js";
import { isGrainPassState } from "../../render/grainPass.js";
import { isVignettePassState } from "../../render/vignettePass.js";
import {
  chromaticAberrationFactory,
  FX_CHROMATIC_ABERRATION_TYPE,
} from "./chromaticAberration.js";
import { FX_GODRAYS_TYPE, godraysFactory } from "./godrays.js";
import { FX_GRAIN_TYPE, grainFactory } from "./grain.js";
import { FX_VIGNETTE_TYPE, vignetteFactory } from "./vignette.js";

function cookPublish(
  factory: typeof godraysFactory,
  params: Record<string, string | number | boolean>,
): unknown {
  const op = factory.create("fx", params);
  let out: unknown;
  op.cook({
    time: 0,
    delta: 0.016,
    frame: 0,
    getInput: () => undefined,
    getParam: (id) => {
      const v = op.params[id];
      if (v === undefined) throw new Error(id);
      return v;
    },
    getBaseParam: (id) => op.params[id],
    setOutput: (_p, v) => {
      out = v;
    },
  });
  return out;
}

describe("Radiance Stack FX operators", () => {
  it("FX/Godrays publishes GodraysPassState", () => {
    const out = cookPublish(godraysFactory, {
      strength: 0.5,
      decay: 0.9,
      monstranceX: 0.4,
      monstranceY: 0.6,
      samples: 24,
      enabled: true,
    });
    expect(isGodraysPassState(out)).toBe(true);
    if (isGodraysPassState(out)) {
      expect(out.strength).toBeCloseTo(0.5);
      expect(out.monstranceX).toBeCloseTo(0.4);
    }
    expect(FX_GODRAYS_TYPE).toBe("FX/Godrays");
  });

  it("FX/ChromaticAberration publishes CA state", () => {
    const out = cookPublish(chromaticAberrationFactory, {
      amount: 0.01,
      edgeWeight: 1,
      enabled: true,
    });
    expect(isChromaticAberrationPassState(out)).toBe(true);
    expect(FX_CHROMATIC_ABERRATION_TYPE).toBe("FX/ChromaticAberration");
  });

  it("FX/Grain publishes grain state with mode", () => {
    const out = cookPublish(grainFactory, {
      amount: 0.2,
      speed: 2,
      mode: "phosphor",
      enabled: true,
    });
    expect(isGrainPassState(out)).toBe(true);
    if (isGrainPassState(out)) {
      expect(out.mode).toBe("phosphor");
      expect(out.amount).toBeCloseTo(0.2);
    }
    expect(FX_GRAIN_TYPE).toBe("FX/Grain");
  });

  it("FX/Vignette publishes vignette with gold tint", () => {
    const out = cookPublish(vignetteFactory, {
      darkness: 0.7,
      offset: 0.2,
      goldTint: true,
      enabled: true,
    });
    expect(isVignettePassState(out)).toBe(true);
    if (isVignettePassState(out)) {
      expect(out.goldTint).toBe(true);
      expect(out.darkness).toBeCloseTo(0.7);
    }
    expect(FX_VIGNETTE_TYPE).toBe("FX/Vignette");
  });

  it("all FX cooks return void", () => {
    for (const factory of [
      godraysFactory,
      chromaticAberrationFactory,
      grainFactory,
      vignetteFactory,
    ]) {
      const op = factory.create("x", {});
      const result = op.cook({
        time: 0,
        delta: 0,
        frame: 0,
        getInput: () => undefined,
        getParam: (id) => {
          const spec = factory.params.find((p) => p.id === id);
          if (!spec) throw new Error(id);
          return op.params[id] ?? spec.default;
        },
        getBaseParam: (id) => op.params[id],
        setOutput: () => {},
      });
      expect(result).toBeUndefined();
    }
  });
});
