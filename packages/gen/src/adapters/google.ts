/**
 * google adapter — Gemini generateContent (§9.3).
 * Text + image generation capabilities.
 */

import { base64ToArrayBuffer } from "../bytes.js";
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

export const GOOGLE_ADAPTER_ID = "google" as const;

const CAPS: readonly AICapability[] = [
  "text.generate",
  "image.generate",
] as const;

function usageFrom(obj: Record<string, unknown>): CapUsage {
  const u = obj.usageMetadata as Record<string, unknown> | undefined;
  return {
    promptTokens:
      typeof u?.promptTokenCount === "number" ? u.promptTokenCount : undefined,
    completionTokens:
      typeof u?.candidatesTokenCount === "number"
        ? u.candidatesTokenCount
        : undefined,
    totalTokens:
      typeof u?.totalTokenCount === "number" ? u.totalTokenCount : undefined,
    requests: 1,
  };
}

export const googleAdapter: ProviderAdapter = {
  id: GOOGLE_ADAPTER_ID,
  capabilities: CAPS,
  configSchema: {
    fields: [
      {
        id: "baseUrl",
        label: "Base URL",
        type: "url",
        default: "https://generativelanguage.googleapis.com",
      },
      {
        id: "model",
        label: "Model",
        type: "string",
        default: "gemini-2.0-flash",
        required: true,
      },
      {
        id: "imageModel",
        label: "Image model",
        type: "string",
        default: "imagen-3.0-generate-002",
      },
    ],
  },

  buildRequest(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): FetchDescriptor {
    const base = configString(
      config,
      "baseUrl",
      "https://generativelanguage.googleapis.com",
    ).replace(/\/+$/, "");

    if (cap === "text.generate") {
      const model =
        req.model ?? configString(config, "model", "gemini-2.0-flash");
      const body: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: req.prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 256,
          temperature: req.temperature ?? 0.7,
        },
      };
      if (req.system) {
        body.systemInstruction = { parts: [{ text: req.system }] };
      }
      // API key via query injection
      return {
        url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        secretInjections: [{ kind: "query", name: "key" }],
        responseMode: "json",
      };
    }

    if (cap === "image.generate") {
      const model =
        req.model ??
        configString(config, "imageModel", "imagen-3.0-generate-002");
      const body = {
        instances: [{ prompt: req.prompt }],
        parameters: { sampleCount: 1 },
      };
      return {
        url: `${base}/v1beta/models/${encodeURIComponent(model)}:predict`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        secretInjections: [{ kind: "query", name: "key" }],
        responseMode: "json",
      };
    }

    throw new Error(`google: unsupported ${cap}`);
  },

  parseJsonResponse(
    cap: AICapability,
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

    if (cap === "image.generate") {
      // Imagen predict: predictions[0].bytesBase64Encoded
      const preds = obj.predictions as unknown[] | undefined;
      const first = preds?.[0] as Record<string, unknown> | undefined;
      const b64 =
        typeof first?.bytesBase64Encoded === "string"
          ? first.bytesBase64Encoded
          : undefined;
      if (!b64) {
        return {
          status: "error",
          errorMessage: "google image: no bytesBase64Encoded",
        };
      }
      return {
        status: "ok",
        imageBytes: base64ToArrayBuffer(b64),
        imageMime: "image/png",
        usage: { requests: 1 },
      };
    }

    const candidates = obj.candidates as unknown[] | undefined;
    const c0 = candidates?.[0] as Record<string, unknown> | undefined;
    const content = c0?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as unknown[] | undefined;
    let text = "";
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p && typeof p === "object" && typeof (p as { text?: string }).text === "string") {
          text += (p as { text: string }).text;
        }
      }
    }
    return {
      status: "ok",
      text,
      usage: usageFrom(obj),
    };
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
