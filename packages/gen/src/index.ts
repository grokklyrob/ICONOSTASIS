/**
 * @iconostasis/gen — BYOK adapters + SecretRef fetch boundary
 * architecture.md §9, §15.1, §18 M2a/M2b.
 */

export const GEN_PACKAGE = "@iconostasis/gen" as const;

export type {
  AICapability,
  CapRequest,
  CapResult,
  CapResultStatus,
  CapUsage,
  CostEstimate,
  FetchDescriptor,
  ProviderAdapter,
  ProviderConfig,
  ProviderConfigField,
  ProviderConfigSchema,
  ProviderInstance,
  ProviderRouting,
  ResponseMode,
  SecretInjection,
  SecretRef,
} from "./types.js";

export { mintSecretRef, isSecretRef, resetSecretRefSeq } from "./secretRef.js";
export { SessionVault, type VaultEntryMeta } from "./vault.js";
export {
  FetchBoundary,
  FetchBoundaryError,
  descriptorHasRawSecret,
  type BoundaryResponse,
  type FetchImpl,
  type MaterializedRequest,
} from "./fetchBoundary.js";
export {
  SpendCeiling,
  DEFAULT_TOKEN_CEILING,
  DEFAULT_REQUEST_CEILING,
  type SpendSnapshot,
  type SpendUnit,
} from "./spend.js";
export {
  ArmingController,
  type ArmingSnapshot,
  type EditorMode as GenEditorMode,
} from "./arming.js";
export { ProviderRegistry } from "./registry.js";
export { GenRuntime, configString, type GenInvokeOptions } from "./runtime.js";
export {
  openaiCompatAdapter,
  OPENAI_COMPAT_ADAPTER_ID,
  openaiCompatConfigSchema,
} from "./adapters/openaiCompat.js";
export {
  anthropicAdapter,
  ANTHROPIC_ADAPTER_ID,
  ANTHROPIC_BROWSER_DIRECT,
} from "./adapters/anthropic.js";
export { googleAdapter, GOOGLE_ADAPTER_ID } from "./adapters/google.js";
export {
  customHttpAdapter,
  CUSTOM_HTTP_ADAPTER_ID,
  extractJsonPath,
  parseCustomHttpWithConfig,
} from "./adapters/customHttp.js";
export {
  HelperClient,
  type HelperConfig,
  type HelperProxyRequest,
  type HelperProxyResponse,
} from "./helperClient.js";
export {
  ProvenanceLedger,
  type GenProvenanceRecord,
  type ProvenanceLedgerOptions,
} from "./provenance.js";
export {
  createGenStack,
  type GenStack,
  type GenStackOptions,
} from "./createGenStack.js";
