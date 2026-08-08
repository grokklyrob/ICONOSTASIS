/**
 * Async cacheScope keys (architecture.md §7.1).
 * Presentation and disk cache keys are (opId, stationId) when station,
 * or (opId) when global — scope is declared on the op, never inferred.
 */

export type CacheScope = "station" | "global";

export function parseCacheScope(raw: unknown): CacheScope {
  return raw === "global" ? "global" : "station";
}

/**
 * Normative cache key fragment for async presentation / disk caches.
 * Extra parts (asset path, generation, etc.) are caller-defined suffixes.
 */
export function asyncCacheKey(
  opId: string,
  cacheScope: CacheScope,
  stationId: string | undefined,
  ...parts: Array<string | number>
): string {
  const scopePart =
    cacheScope === "global" ? "global" : `station:${stationId ?? "default"}`;
  const suffix = parts.map(String).join("|");
  return suffix.length > 0
    ? `${opId}|${scopePart}|${suffix}`
    : `${opId}|${scopePart}`;
}
