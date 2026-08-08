/**
 * Material handles published by MAT/* ops (§7.1, Appendix A).
 * Opaque to cook; render backend interprets kind + params.
 */

export type MaterialKind =
  | "points"
  | "goldLeafPbr"
  | "halo"
  | "customShader";

export interface MaterialHandle {
  kind: "material";
  materialKind: MaterialKind;
  params: Record<string, number | string | boolean>;
}

export function isMaterialHandle(value: unknown): value is MaterialHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MaterialHandle).kind === "material"
  );
}
