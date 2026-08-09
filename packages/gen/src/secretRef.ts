/**
 * SecretRef minting helpers (§15.1).
 * Opaque branded ids — raw secrets live only inside SessionVault.
 */

import type { SecretRef } from "./types.js";

let seq = 0;

/** Create a branded SecretRef id (does not store the secret). */
export function mintSecretRef(prefix = "sec"): SecretRef {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${seq.toString(36)}`;
  return `${prefix}_${rand}` as SecretRef;
}

export function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === "string" && value.startsWith("sec_");
}

/** Reset mint counter (tests only). */
export function resetSecretRefSeq(): void {
  seq = 0;
}
