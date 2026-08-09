/**
 * App-side GEN host — session vault, registry, spend, arming, runtime (§9, M2).
 * Implements engine GenCookHost; secrets never enter ProjectStore / graph / .icx.
 */

import type { GenCookHost, GenHostRequest, GenHostResult } from "@iconostasis/engine";
import {
  createGenStack,
  OPENAI_COMPAT_ADAPTER_ID,
  type CapResult,
  type GenStack,
  type ProviderInstance,
  type SecretRef,
} from "@iconostasis/gen";

export type GenHostListener = () => void;

const DEFAULT_OLLAMA: Omit<ProviderInstance, "secretRef"> = {
  id: "local-ollama",
  adapterId: OPENAI_COMPAT_ADAPTER_ID,
  label: "Local Ollama",
  config: {
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "smollm:135m",
    requireAuth: false,
  },
  routing: "direct",
};

/**
 * Local Helper mock image/TTS (§18 "or mock in UI"). Ollama serves neither
 * image.generate nor speech.synthesize, so Icon/Antiphon need their own target.
 * Requires `pnpm helper`; the mock routes are unpaired and CORS-open on
 * loopback, so this works on the direct route.
 */
const DEFAULT_MOCK: Omit<ProviderInstance, "secretRef"> = {
  id: "local-mock",
  adapterId: OPENAI_COMPAT_ADAPTER_ID,
  label: "Local Helper mock (image + TTS)",
  config: {
    baseUrl: "http://127.0.0.1:47821/v1/mock",
    model: "mock-icon-1",
    requireAuth: false,
  },
  routing: "direct",
};

function toHostResult(r: CapResult): GenHostResult {
  return {
    status: r.status,
    text: r.text,
    imageBytes: r.imageBytes,
    imageMime: r.imageMime,
    audioBytes: r.audioBytes,
    audioMime: r.audioMime,
    errorMessage: r.errorMessage,
    model: r.model,
    providerId: r.providerId,
    usage: r.usage,
    controlBlocked: r.controlBlocked,
  };
}

export class GenHost implements GenCookHost {
  readonly stack: GenStack;
  private readonly listeners = new Set<GenHostListener>();
  private lastTestResult: CapResult | null = null;
  private lastTestAt: number | null = null;

  constructor() {
    this.stack = createGenStack();
    this.stack.registry.upsertInstance({
      ...DEFAULT_OLLAMA,
      secretRef: null,
    });
    this.stack.registry.upsertInstance({
      ...DEFAULT_MOCK,
      secretRef: null,
    });
  }

  subscribe(fn: GenHostListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  getLastTest(): { result: CapResult; at: number } | null {
    if (!this.lastTestResult || this.lastTestAt === null) return null;
    return { result: this.lastTestResult, at: this.lastTestAt };
  }

  /** GenCookHost — used by GEN ops from cook (never awaited by evaluator). */
  async invoke(req: GenHostRequest): Promise<GenHostResult> {
    const result = await this.stack.runtime.invoke({
      providerInstanceId: req.providerInstanceId,
      cap: req.cap,
      req: {
        prompt: req.prompt,
        system: req.system,
        maxTokens: req.maxTokens,
        temperature: req.temperature,
        seed: req.seed,
        model: req.model,
      },
      signal: req.signal,
      opId: req.opId,
      onDelta: req.onDelta,
    });
    this.emit();
    return toHostResult(result);
  }

  syncMode(mode: "edit" | "perform"): void {
    // No state change ⇒ no notification. Called every store tick and from
    // render paths, so an unconditional emit here turns any listener that
    // touches mode into unbounded recursion.
    if (this.stack.arming.snapshot().mode === mode) return;
    this.stack.arming.setMode(mode);
    this.emit();
  }

  setGlobalArmed(mode: "edit" | "perform", armed: boolean): void {
    this.stack.arming.setGlobalArmed(mode, armed);
    this.emit();
  }

  putSecret(label: string, secret: string): SecretRef {
    const ref = this.stack.vault.put(label, secret);
    this.emit();
    return ref;
  }

  revokeSecret(ref: SecretRef): void {
    this.stack.vault.revoke(ref);
    this.emit();
  }

  upsertProvider(instance: ProviderInstance): void {
    this.stack.registry.upsertInstance(instance);
    this.emit();
  }

  removeProvider(id: string): void {
    this.stack.registry.removeInstance(id);
    this.emit();
  }

  bindSecretToProvider(providerId: string, secretRef: SecretRef | null): void {
    this.stack.registry.setInstanceSecret(providerId, secretRef);
    this.emit();
  }

  raiseSpendCeiling(n: number): void {
    this.stack.spend.raiseCeiling(n);
    this.emit();
  }

  setHelper(baseUrl: string, pairToken: string | null): void {
    this.stack.helper.setConfig(
      pairToken ? { baseUrl, pairToken } : { baseUrl, pairToken: "" },
    );
    this.emit();
  }

  async pairHelper(baseUrl: string, token: string): Promise<{ ok: boolean; error?: string }> {
    this.stack.helper.setConfig({ baseUrl, pairToken: "" });
    const r = await this.stack.helper.pair(token);
    this.emit();
    return r;
  }

  async testCall(providerInstanceId: string): Promise<CapResult> {
    const result = await this.stack.runtime.invoke({
      providerInstanceId,
      cap: "text.generate",
      req: {
        prompt: "Reply with exactly one word: lumen",
        maxTokens: 16,
        temperature: 0,
      },
      signal: AbortSignal.timeout(60_000),
    });
    this.lastTestResult = result;
    this.lastTestAt = Date.now();
    this.emit();
    return result;
  }

  vaultSecretsForTaint(): readonly string[] {
    return this.stack.vault.allRawSecretsForTaint();
  }

  provenanceDoc(): { schemaVersion: 1; records: unknown[] } {
    return this.stack.provenance.toDoc();
  }
}
