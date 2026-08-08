/** Shared FX param parsing (modulatable cooks). */

import type { ParamValue } from "../../types/params.js";

export function asBool(raw: ParamValue | undefined, fallback = true): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "true") return true;
  if (raw === 0 || raw === "false") return false;
  return fallback;
}

export function asFinite(
  raw: ParamValue | undefined,
  fallback: number,
): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
