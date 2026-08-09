/**
 * Host-injected GEN invoke surface (architecture.md §9).
 * packages/engine stays free of adapters/secrets; app wires @iconostasis/gen.
 * Player never provides this host — GEN plays cached artifacts only (§13.1).
 */

export type GenCapability =
  | "text.generate"
  | "text.stream"
  | "image.generate"
  | "speech.synthesize";

export interface GenHostRequest {
  opId: string;
  /** Empty string → host picks default provider for capability. */
  providerInstanceId: string;
  cap: GenCapability;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  model?: string;
  signal: AbortSignal;
  onDelta?: (chunk: string) => void;
}

export interface GenHostUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requests?: number;
}

export interface GenHostResult {
  status: "ok" | "error" | "aborted";
  text?: string;
  /** Image bytes for GEN/Icon (field path). */
  imageBytes?: ArrayBuffer;
  imageMime?: string;
  /** Audio bytes for GEN/Antiphon. */
  audioBytes?: ArrayBuffer;
  audioMime?: string;
  errorMessage?: string;
  model?: string;
  providerId?: string;
  usage?: GenHostUsage;
  controlBlocked?: boolean;
}

/**
 * Async invoke bridge. Cook must schedule and never await (AMD-01).
 */
export interface GenCookHost {
  invoke(req: GenHostRequest): Promise<GenHostResult>;
}
