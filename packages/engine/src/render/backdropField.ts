/**
 * Generated image field → render backdrop (§5 port types: `field` is a
 * texture/render-target handle; §9.4 `GEN/Icon` outputs one).
 *
 * The handle stays headless — encoded bytes, no GPU object — so cook code and
 * the headless tests never touch a browser image API. Decode and upload are the
 * render backend's job (§17: engine is UI-free but owns the render substrate).
 */

export interface GenFieldHandle {
  kind: "gen-field";
  mime: string;
  bytes: ArrayBuffer;
  width?: number;
  height?: number;
  prompt: string;
}

export function isGenFieldHandle(value: unknown): value is GenFieldHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GenFieldHandle).kind === "gen-field"
  );
}
