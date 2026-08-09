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

/**
 * Reference BYOK provider (§18 M2 demo, AMD-30). OpenRouter resells Anthropic,
 * xAI and others behind one OpenAI-compatible endpoint, so a single user key
 * reaches Claude and Grok without a vendor-specific adapter.
 *
 * Ships with **no key** — BYOK means the user supplies one (§4.2). Hold a key
 * in the session vault and bind it here; nothing is written to disk (§15.1).
 *
 * This is a *default*, not a restriction. `openai-compat` is generic: point
 * `baseUrl` at any OpenAI-compatible endpoint, local inference servers
 * included (`http://127.0.0.1:11434/v1` for Ollama, LM Studio, llama.cpp).
 * AMD-30 removed local inference from the milestone gate, not from the product.
 */
const DEFAULT_OPENROUTER: Omit<ProviderInstance, "secretRef"> = {
  id: "openrouter",
  adapterId: OPENAI_COMPAT_ADAPTER_ID,
  label: "OpenRouter (BYOK)",
  config: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-3.5-haiku",
    requireAuth: true,
  },
  routing: "direct",
};

/**
 * Local Helper mock text/image/TTS (§18 "or mock in UI"). Cloud text providers
 * generally serve neither image.generate nor speech.synthesize on the same
 * endpoint, so Icon/Antiphon need their own target. Requires `pnpm helper`; the
 * mock routes are unpaired and CORS-open on loopback, so the direct route works.
 *
 * The chat route makes the whole graph drivable with no key and no spend, which
 * is what keeps development and CI free. It is **not** the §18 text path —
 * that requires a real provider on the user's own key.
 */
const DEFAULT_MOCK: Omit<ProviderInstance, "secretRef"> = {
  id: "local-mock",
  adapterId: OPENAI_COMPAT_ADAPTER_ID,
  label: "Local Helper mock (text + image + TTS)",
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

/**
 * `?spendCeiling=N` — start the session at a low ceiling.
 *
 * §18 M2 requires demonstrating the hard spend stop. At the 50,000-token
 * default that costs 50,000 tokens to reach, so the stop is undemonstrable in
 * a demo and untestable in sign-off. Lowering only the *starting* ceiling
 * changes no policy: raising it is still an explicit user action, and the stop
 * itself is the same code path.
 */
function ceilingFromQuery(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = new URLSearchParams(window.location.search).get("spendCeiling");
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export class GenHost implements GenCookHost {
  readonly stack: GenStack;
  private readonly listeners = new Set<GenHostListener>();
  private lastTestResult: CapResult | null = null;
  private lastTestAt: number | null = null;

  constructor() {
    this.stack = createGenStack({ spendCeiling: ceilingFromQuery() });
    this.stack.registry.upsertInstance({
      ...DEFAULT_OPENROUTER,
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

  /**
   * Will the provider this op resolves to actually be able to call out?
   *
   * `providerInstanceId: ""` resolves to the first registered instance, which
   * since AMD-30 is the BYOK default — keyless on arrival. So the honest
   * first-run answer is `false`, and the UI should say so rather than let a
   * fire vanish with no visible cause.
   *
   * Usable means: needs no key, or needs one and has one bound. It does not
   * mean the endpoint is reachable — only the invoke can tell you that.
   */
  isProviderUsable(providerInstanceId: string): boolean {
    const id = providerInstanceId.trim();
    const inst = id
      ? this.stack.registry.getInstance(id)
      : this.stack.registry.listInstances()[0];
    if (!inst) return false;
    return inst.config.requireAuth !== true || inst.secretRef !== null;
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
