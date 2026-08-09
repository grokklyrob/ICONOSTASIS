/**
 * Byte decoding for adapter + helper response bodies.
 *
 * `packages/gen` is bundled into the browser app (vite aliases it to source),
 * so these paths must not use Node's `Buffer`. Vitest runs in Node, where
 * `Buffer` resolves fine — a `Buffer.from` here passes tests and throws
 * `ReferenceError` in the browser on the first image/audio arrival.
 */

/** Decode standard or URL-safe base64 to a plain ArrayBuffer. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Encode text as UTF-8 bytes in a plain ArrayBuffer. */
export function utf8ToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}
