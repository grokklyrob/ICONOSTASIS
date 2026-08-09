/**
 * Factory: session Key Vault + registry + boundary + spend + arming + runtime.
 * M2b: all shipped adapters + optional helper + provenance ledger.
 */

import { anthropicAdapter } from "./adapters/anthropic.js";
import { customHttpAdapter } from "./adapters/customHttp.js";
import { googleAdapter } from "./adapters/google.js";
import { openaiCompatAdapter } from "./adapters/openaiCompat.js";
import { ArmingController } from "./arming.js";
import { FetchBoundary, type FetchImpl } from "./fetchBoundary.js";
import { HelperClient, type HelperConfig } from "./helperClient.js";
import { ProvenanceLedger } from "./provenance.js";
import { ProviderRegistry } from "./registry.js";
import { GenRuntime } from "./runtime.js";
import { SpendCeiling, type SpendUnit } from "./spend.js";
import { SessionVault } from "./vault.js";

export interface GenStackOptions {
  fetchImpl?: FetchImpl;
  spendUnit?: SpendUnit;
  spendCeiling?: number;
  /** Register shipped adapters. Default true. */
  registerDefaults?: boolean;
  helper?: HelperConfig | null;
  includePromptText?: boolean;
}

export interface GenStack {
  vault: SessionVault;
  registry: ProviderRegistry;
  boundary: FetchBoundary;
  spend: SpendCeiling;
  arming: ArmingController;
  runtime: GenRuntime;
  helper: HelperClient;
  provenance: ProvenanceLedger;
}

export function createGenStack(opts: GenStackOptions = {}): GenStack {
  const vault = new SessionVault();
  const registry = new ProviderRegistry();
  if (opts.registerDefaults !== false) {
    registry.registerAdapter(openaiCompatAdapter);
    registry.registerAdapter(anthropicAdapter);
    registry.registerAdapter(googleAdapter);
    registry.registerAdapter(customHttpAdapter);
  }
  const boundary = new FetchBoundary(vault, opts.fetchImpl);
  const spend = new SpendCeiling(opts.spendUnit ?? "tokens", opts.spendCeiling);
  const arming = new ArmingController();
  const helper = new HelperClient(opts.helper ?? null, opts.fetchImpl as typeof fetch);
  const provenance = new ProvenanceLedger({
    includePromptText: opts.includePromptText,
  });
  const runtime = new GenRuntime(
    registry,
    boundary,
    spend,
    arming,
    helper,
    provenance,
  );
  return {
    vault,
    registry,
    boundary,
    spend,
    arming,
    runtime,
    helper,
    provenance,
  };
}
