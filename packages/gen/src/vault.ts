/**
 * Session Key Vault (§15.1 default: session-only).
 * Raw secrets are closure-held in this module instance; never on window,
 * never localStorage. Adapters receive SecretRef only.
 */

import { mintSecretRef } from "./secretRef.js";
import type { SecretRef } from "./types.js";

export interface VaultEntryMeta {
  ref: SecretRef;
  label: string;
  createdAt: number;
}

export class SessionVault {
  private readonly secrets = new Map<string, string>();
  private readonly labels = new Map<string, string>();
  private readonly created = new Map<string, number>();

  /**
   * Store a secret; returns opaque SecretRef.
   * Empty secrets are rejected.
   */
  put(label: string, secret: string): SecretRef {
    if (!secret) {
      throw new Error("SessionVault.put: empty secret rejected");
    }
    const ref = mintSecretRef();
    this.secrets.set(ref, secret);
    this.labels.set(ref, label || "unnamed");
    this.created.set(ref, Date.now());
    return ref;
  }

  /**
   * Resolve raw secret for the fetch boundary only (AMD-06).
   * Adapters and UI must never call this.
   */
  resolveForBoundary(ref: SecretRef): string | undefined {
    return this.secrets.get(ref);
  }

  has(ref: SecretRef): boolean {
    return this.secrets.has(ref);
  }

  /** Metadata only — never raw secrets. */
  list(): VaultEntryMeta[] {
    const out: VaultEntryMeta[] = [];
    for (const [ref, label] of this.labels) {
      out.push({
        ref: ref as SecretRef,
        label,
        createdAt: this.created.get(ref) ?? 0,
      });
    }
    return out;
  }

  revoke(ref: SecretRef): boolean {
    const had = this.secrets.delete(ref);
    this.labels.delete(ref);
    this.created.delete(ref);
    return had;
  }

  clear(): void {
    this.secrets.clear();
    this.labels.clear();
    this.created.clear();
  }

  /**
   * Exact secret strings for §12.3 taint gate (`vaultSecrets` option).
   * Do not log, serialize, or expose to UI.
   */
  allRawSecretsForTaint(): readonly string[] {
    return [...this.secrets.values()];
  }

  /** Count of held secrets (for UI meters). */
  size(): number {
    return this.secrets.size;
  }
}
