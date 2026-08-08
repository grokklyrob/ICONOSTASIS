/**
 * Content hashing for assets / provenance (§12.2).
 * Uses Web Crypto (browser + modern Node); never blocks the cook path.
 */

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      "sha256Hex: Web Crypto SubtleCrypto unavailable in this environment",
    );
  }
  return c.subtle;
}

/** SHA-256 hex digest of bytes (lowercase). */
export async function sha256Hex(
  data: ArrayBuffer | Uint8Array | string,
): Promise<string> {
  let buf: BufferSource;
  if (typeof data === "string") {
    buf = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    // Copy to a plain ArrayBuffer-backed view (avoid SharedArrayBuffer typing).
    buf = data.slice();
  } else {
    buf = data;
  }
  const digest = await getSubtle().digest("SHA-256", buf);
  return toHex(digest);
}

/** True for 64-char lowercase/uppercase hex SHA-256 digests. */
export function isSha256Hex(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

/** True for standard base64 of 32 bytes (SHA-256) with optional padding. */
export function isSha256Base64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+=*$/.test(value)) return false;
  // 32 bytes → 44 chars with padding, 43 without
  return value.length === 44 || value.length === 43;
}
