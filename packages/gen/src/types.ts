/**
 * GEN capability contracts (architecture.md §9.2).
 * Adapters declare capabilities and build request descriptors;
 * only the fetch boundary resolves SecretRef and performs TLS (AMD-06).
 */

/** Opaque handle — never contains the raw secret string (§15.1). */
export type SecretRef = string & { readonly __brand: "SecretRef" };

export type AICapability =
  | "text.generate"
  | "text.stream"
  | "image.generate"
  | "speech.synthesize"
  | "speech.transcribe"
  | "embed.text";

export interface CapRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional model override for this call. */
  model?: string;
  seed?: number;
  /** Optional init image (base64 or bytes descriptor for adapters). */
  initImageBase64?: string;
  /** Extra provider-specific JSON fields (never secrets). */
  extra?: Record<string, unknown>;
}

export interface CostEstimate {
  unit: "tokens" | "requests" | "currency";
  amount: number;
  /** True when amount is a best-effort estimate (§9.3). */
  estimated: boolean;
}

export type CapResultStatus = "ok" | "error" | "aborted";

export interface CapUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requests?: number;
}

export interface CapResult {
  status: CapResultStatus;
  text?: string;
  /** image.generate payload */
  imageBytes?: ArrayBuffer;
  imageMime?: string;
  /** speech.synthesize payload */
  audioBytes?: ArrayBuffer;
  audioMime?: string;
  errorMessage?: string;
  usage?: CapUsage;
  model?: string;
  providerId?: string;
  /** True when result came from a hard control (disarmed / spend stop). */
  controlBlocked?: boolean;
}

/**
 * Where the raw secret is injected by the fetch boundary only.
 * Adapters list injections; they never receive the secret value.
 */
export type SecretInjection =
  | { kind: "header"; name: string; /** e.g. "Bearer " */ prefix?: string }
  | { kind: "query"; name: string };

export type ResponseMode = "json" | "sse" | "binary";

/**
 * Wire request without secrets (AMD-06).
 * Boundary applies SecretInjection + fetch.
 */
export interface FetchDescriptor {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body?: string;
  secretInjections: readonly SecretInjection[];
  responseMode: ResponseMode;
}

export interface ProviderConfigField {
  id: string;
  label: string;
  type: "string" | "url" | "number" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface ProviderConfigSchema {
  fields: readonly ProviderConfigField[];
}

/** User-configured non-secret settings for a provider instance. */
export type ProviderConfig = Record<string, string | number | boolean>;

export type ProviderRouting = "direct" | "helper";

/**
 * Adapter contract (§9.2).
 * Must not call global fetch against providers; must not accept raw secrets.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: readonly AICapability[];
  readonly configSchema: ProviderConfigSchema;
  buildRequest(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): FetchDescriptor;
  parseJsonResponse(
    cap: AICapability,
    body: unknown,
    httpStatus: number,
  ): CapResult;
  /**
   * SSE data payload (content of `data: …` line, not the `data:` prefix).
   * Return delta text and/or done signal.
   */
  parseSseEvent?(
    cap: AICapability,
    data: string,
  ): {
    delta?: string;
    done?: boolean;
    usage?: CapUsage;
    error?: string;
    model?: string;
  };
  estimate?(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): CostEstimate;
}

/** Named configured provider (registry entry). */
export interface ProviderInstance {
  id: string;
  adapterId: string;
  label: string;
  config: ProviderConfig;
  secretRef: SecretRef | null;
  routing: ProviderRouting;
}
