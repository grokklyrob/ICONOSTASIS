/**
 * anthropic adapter — Messages API, SSE streaming (§9.3).
 * Browser-direct is conditional; metadata does not claim unconditional CORS.
 * Builds descriptors only (AMD-06).
 */

import { configString } from "../runtime.js";
import type {
  AICapability,
  CapRequest,
  CapResult,
  CapUsage,
  CostEstimate,
  FetchDescriptor,
  ProviderAdapter,
  ProviderConfig,
} from "../types.js";

export const ANTHROPIC_ADAPTER_ID = "anthropic" as const;

/** Adapter does not claim unconditional browser CORS (AMD-29 / §9.3). */
export const ANTHROPIC_BROWSER_DIRECT = "conditional" as const;

const CAPS: readonly AICapability[] = ["text.generate", "text.stream"];

function usageFrom(obj: Record<string, unknown>): CapUsage {
  const u = obj.usage as Record<string, unknown> | undefined;
  const inTok =
    typeof u?.input_tokens === "number" ? u.input_tokens : undefined;
  const outTok =
    typeof u?.output_tokens === "number" ? u.output_tokens : undefined;
  const total =
    inTok !== undefined || outTok !== undefined
      ? (inTok ?? 0) + (outTok ?? 0)
      : undefined;
  return {
    promptTokens: inTok,
    completionTokens: outTok,
    totalTokens: total,
    requests: 1,
  };
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block && typeof block === "object") {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") return b.text;
      }
      return "";
    })
    .join("");
}

export const anthropicAdapter: ProviderAdapter = {
  id: ANTHROPIC_ADAPTER_ID,
  capabilities: CAPS,
  configSchema: {
    fields: [
      {
        id: "baseUrl",
        label: "Base URL",
        type: "url",
        default: "https://api.anthropic.com",
      },
      {
        id: "model",
        label: "Model",
        type: "string",
        default: "claude-sonnet-4-20250514",
        required: true,
      },
      {
        id: "apiVersion",
        label: "anthropic-version",
        type: "string",
        default: "2023-06-01",
      },
    ],
  },

  buildRequest(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): FetchDescriptor {
    if (cap !== "text.generate" && cap !== "text.stream") {
      throw new Error(`anthropic: unsupported ${cap}`);
    }
    const base = configString(
      config,
      "baseUrl",
      "https://api.anthropic.com",
    ).replace(/\/+$/, "");
    const model = req.model ?? configString(config, "model", "claude-sonnet-4-20250514");
    const apiVersion = configString(config, "apiVersion", "2023-06-01");
    const stream = cap === "text.stream";
    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 256,
      messages: [{ role: "user", content: req.prompt }],
      stream,
    };
    if (req.system) body.system = req.system;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    return {
      url: `${base}/v1/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": apiVersion,
        Accept: stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      secretInjections: [{ kind: "header", name: "x-api-key", prefix: "" }],
      responseMode: stream ? "sse" : "json",
    };
  },

  parseJsonResponse(
    _cap: AICapability,
    body: unknown,
    httpStatus: number,
  ): CapResult {
    if (!body || typeof body !== "object") {
      return { status: "error", errorMessage: `HTTP ${httpStatus}` };
    }
    const obj = body as Record<string, unknown>;
    if (httpStatus < 200 || httpStatus >= 300) {
      const err = obj.error as Record<string, unknown> | undefined;
      return {
        status: "error",
        errorMessage: String(err?.message ?? JSON.stringify(obj).slice(0, 200)),
      };
    }
    return {
      status: "ok",
      text: textFromContent(obj.content),
      model: typeof obj.model === "string" ? obj.model : undefined,
      usage: usageFrom(obj),
    };
  },

  parseSseEvent(_cap: AICapability, data: string) {
    try {
      const obj = JSON.parse(data) as Record<string, unknown>;
      const type = obj.type;
      if (type === "content_block_delta") {
        const delta = obj.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          return { delta: delta.text };
        }
      }
      if (type === "message_delta") {
        const usage = obj.usage as Record<string, unknown> | undefined;
        if (usage) {
          return {
            done: true,
            usage: {
              completionTokens:
                typeof usage.output_tokens === "number"
                  ? usage.output_tokens
                  : undefined,
              requests: 1,
            },
          };
        }
        return { done: true };
      }
      if (type === "message_stop") return { done: true };
      if (type === "error") {
        return {
          error: String(
            (obj.error as Record<string, unknown> | undefined)?.message ??
              "anthropic SSE error",
          ),
        };
      }
      return {};
    } catch {
      return { error: `Invalid Anthropic SSE: ${data.slice(0, 60)}` };
    }
  },

  estimate(
    _cap: AICapability,
    req: CapRequest,
    _config: ProviderConfig,
  ): CostEstimate {
    return {
      unit: "tokens",
      amount: Math.ceil(req.prompt.length / 4) + (req.maxTokens ?? 256),
      estimated: true,
    };
  },
};
