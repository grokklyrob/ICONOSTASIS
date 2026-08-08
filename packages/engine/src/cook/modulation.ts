/**
 * Resolve first-class modulation edges into effective param values (AMD-14).
 * Base params on the instance are never mutated.
 */

import type { ModulationEdge, ModulationMap } from "../graph/types.js";
import type { ParamValue } from "../types/params.js";

export function remapSignal(value: number, map?: ModulationMap): number {
  if (!map) return value;
  const [in0, in1] = map.in;
  const [out0, out1] = map.out;
  const span = in1 - in0;
  const t = span === 0 ? 0 : (value - in0) / span;
  const clamped = Math.min(1, Math.max(0, t));
  return out0 + clamped * (out1 - out0);
}

/**
 * Build effective params for an op: start from base, overlay each modulation
 * targeting that op (last edge wins if multiple drive the same param).
 */
export function resolveEffectiveParams(
  base: Record<string, ParamValue>,
  mods: readonly ModulationEdge[],
  readSignal: (fromOpId: string, port: string) => unknown,
): Record<string, ParamValue> {
  const effective: Record<string, ParamValue> = { ...base };

  for (const mod of mods) {
    const raw = readSignal(mod.from.opId, mod.from.port);
    const signal = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(signal)) continue;
    effective[mod.to.param] = remapSignal(signal, mod.map);
  }

  return effective;
}
