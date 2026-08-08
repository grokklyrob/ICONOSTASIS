/** Shared param parsing for cooks. */

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

export function asString(
  raw: ParamValue | undefined,
  fallback: string,
): string {
  if (typeof raw === "string") return raw;
  if (raw === undefined || raw === null) return fallback;
  return String(raw);
}

export function asSignal(raw: unknown, fallback = 0): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw === true) return 1;
  if (raw === false) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
