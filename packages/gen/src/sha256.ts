/**
 * SHA-256 hex for browser + node (no node:crypto import — breaks Vite browser).
 */

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Prefer Web Crypto; fall back to a tiny pure implementation for odd test envs. */
export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  let data: Uint8Array<ArrayBuffer>;
  if (typeof input === "string") {
    data = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    data = new Uint8Array(input);
  } else {
    // Copy: a caller's view may be SharedArrayBuffer-backed, which is not a
    // BufferSource. Same guard as engine persist/hash.ts.
    data = new Uint8Array(input.byteLength);
    data.set(input);
  }

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(digest));
  }

  // Minimal pure fallback (slow; tests only). Not used in secure browser contexts.
  return pureSha256Hex(data);
}

/** Compact SHA-256 for non-subtle environments (node without webcrypto polyfill). */
function pureSha256Hex(bytes: Uint8Array): string {
  // Use Web Crypto polyfill path via node createHash only if available without static import
  // Avoid bundling node:crypto into the browser graph.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = (0, eval)("require") as NodeRequire | undefined;
    if (typeof req === "function") {
      const { createHash } = req("crypto") as typeof import("crypto");
      return createHash("sha256").update(bytes).digest("hex");
    }
  } catch {
    /* fall through */
  }
  throw new Error("sha256Hex: Web Crypto subtle required in this environment");
}
