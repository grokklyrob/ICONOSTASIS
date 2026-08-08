/**
 * Tone map curves on OUT/Render (Appendix A — not a separate FX catalog op).
 * ACES default; Gold Leaf = lifted warm highlights (§8.2).
 */

export type ToneMapCurve = "aces" | "goldLeaf";

export function parseToneMapCurve(raw: unknown): ToneMapCurve {
  return raw === "goldLeaf" ? "goldLeaf" : "aces";
}
