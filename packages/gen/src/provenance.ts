/**
 * Provenance ledger for successful GEN invokes (§12.4).
 * Lives in gen runtime; exported into .icx provenance.json by app pack.
 */

import { sha256Hex } from "./sha256.js";

export interface GenProvenanceRecord {
  artifactHash: string;
  capability: string;
  providerClass: string;
  modelId?: string;
  promptHash: string;
  promptText?: string;
  params: Record<string, unknown>;
  seed?: number;
  nondeterministic?: boolean;
  createdAt: string;
  opId?: string;
}

export interface ProvenanceLedgerOptions {
  /** Include promptText in records (authoring default on). */
  includePromptText?: boolean;
}

export class ProvenanceLedger {
  private records: GenProvenanceRecord[] = [];
  private includePromptText: boolean;

  constructor(opts: ProvenanceLedgerOptions = {}) {
    this.includePromptText = opts.includePromptText !== false;
  }

  list(): readonly GenProvenanceRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
  }

  toDoc(): { schemaVersion: 1; records: GenProvenanceRecord[] } {
    return { schemaVersion: 1, records: [...this.records] };
  }

  async recordSuccess(opts: {
    capability: string;
    providerClass: string;
    modelId?: string;
    prompt: string;
    params?: Record<string, unknown>;
    seed?: number;
    opId?: string;
    artifactMaterial: string | ArrayBuffer;
    nondeterministic?: boolean;
  }): Promise<GenProvenanceRecord> {
    const promptHash = await sha256Hex(opts.prompt);
    const artifactHash = await sha256Hex(opts.artifactMaterial);

    const rec: GenProvenanceRecord = {
      artifactHash,
      capability: opts.capability,
      providerClass: opts.providerClass,
      modelId: opts.modelId,
      promptHash,
      promptText: this.includePromptText ? opts.prompt : undefined,
      params: opts.params ?? {},
      seed: opts.seed,
      nondeterministic: opts.nondeterministic,
      createdAt: new Date().toISOString(),
      opId: opts.opId,
    };
    this.records.push(rec);
    return rec;
  }
}
