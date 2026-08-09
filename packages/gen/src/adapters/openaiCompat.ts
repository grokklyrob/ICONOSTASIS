/**
 * openai-compat adapter (§9.3).
 * OpenAI, OpenRouter, Groq, Mistral, Together, local Ollama / LM Studio / llama.cpp.
 * Builds FetchDescriptors only — never calls fetch; never sees raw secrets (AMD-06).
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

export const OPENAI_COMPAT_ADAPTER_ID = "openai-compat" as const;

const CAPABILITIES: readonly AICapability[] = [
  "text.generate",
  "text.stream",
  "image.generate",
  "speech.synthesize",
] as const;

export const openaiCompatConfigSchema = {
  fields: [
    {
      id: "baseUrl",
      label: "Base URL",
      type: "url" as const,
      required: true,
      default: "http://127.0.0.1:11434/v1",
      description: "OpenAI-compatible API root (Ollama default shown)",
    },
    {
      id: "model",
      label: "Model",
      type: "string" as const,
      required: true,
      default: "llama3.2",
    },
    {
      id: "requireAuth",
      label: "Require API key",
      type: "boolean" as const,
      default: false,
      description: "Off for local Ollama; on for cloud OpenAI-compat hosts",
    },
  ],
} as const;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function chatBody(
  req: CapRequest,
  config: ProviderConfig,
  stream: boolean,
): Record<string, unknown> {
  const model = req.model ?? configString(config, "model", "llama3.2");
  const messages: { role: string; content: string }[] = [];
  if (req.system) {
    messages.push({ role: "system", content: req.system });
  }
  messages.push({ role: "user", content: req.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
  };
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.extra) {
    for (const [k, v] of Object.entries(req.extra)) {
      if (k === "messages" || k === "stream") continue;
      body[k] = v;
    }
  }
  return body;
}

function usageFrom(obj: Record<string, unknown>): CapUsage | undefined {
  const u = obj.usage;
  if (!u || typeof u !== "object") return { requests: 1 };
  const usage = u as Record<string, unknown>;
  const promptTokens =
    typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const completionTokens =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : undefined;
  const totalTokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : promptTokens !== undefined || completionTokens !== undefined
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    requests: 1,
  };
}

function contentFromChoices(body: unknown): {
  text?: string;
  model?: string;
  usage?: CapUsage;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { error: "Invalid JSON response" };
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.error === "string") return { error: obj.error };
  if (obj.error && typeof obj.error === "object") {
    const e = obj.error as Record<string, unknown>;
    return { error: String(e.message ?? JSON.stringify(e)) };
  }
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { error: "No choices in response" };
  }
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const text =
    typeof message?.content === "string"
      ? message.content
      : typeof first.text === "string"
        ? first.text
        : undefined;
  return {
    text: text ?? "",
    model: typeof obj.model === "string" ? obj.model : undefined,
    usage: usageFrom(obj),
  };
}

export const openaiCompatAdapter: ProviderAdapter = {
  id: OPENAI_COMPAT_ADAPTER_ID,
  capabilities: CAPABILITIES,
  configSchema: openaiCompatConfigSchema,

  buildRequest(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): FetchDescriptor {
    const baseUrl = configString(
      config,
      "baseUrl",
      "http://127.0.0.1:11434/v1",
    );
    if (!baseUrl) {
      throw new Error("openai-compat: baseUrl is required");
    }
    const requireAuth = config.requireAuth === true;
    const auth = requireAuth
      ? ([{ kind: "header" as const, name: "Authorization", prefix: "Bearer " }] as const)
      : [];

    if (cap === "image.generate") {
      const model = req.model ?? configString(config, "imageModel", "dall-e-3");
      return {
        url: joinUrl(baseUrl, "/images/generations"),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          n: 1,
          response_format: "b64_json",
          size: "1024x1024",
        }),
        secretInjections: [...auth],
        responseMode: "json",
      };
    }

    if (cap === "speech.synthesize") {
      const model = req.model ?? configString(config, "ttsModel", "tts-1");
      const voice = configString(config, "voice", "alloy");
      return {
        url: joinUrl(baseUrl, "/audio/speech"),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          model,
          input: req.prompt,
          voice,
        }),
        secretInjections: [...auth],
        responseMode: "binary",
      };
    }

    if (cap !== "text.generate" && cap !== "text.stream") {
      throw new Error(`openai-compat: unsupported capability ${cap}`);
    }
    const stream = cap === "text.stream";
    const body = chatBody(req, config, stream);

    return {
      url: joinUrl(baseUrl, "/chat/completions"),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      secretInjections: [...auth],
      responseMode: stream ? "sse" : "json",
    };
  },

  parseJsonResponse(
    cap: AICapability,
    body: unknown,
    httpStatus: number,
  ): CapResult {
    if (httpStatus < 200 || httpStatus >= 300) {
      const parsed = contentFromChoices(body);
      return {
        status: "error",
        errorMessage:
          parsed.error ??
          (typeof body === "object" && body
            ? JSON.stringify(body).slice(0, 240)
            : `HTTP ${httpStatus}`),
      };
    }

    if (cap === "image.generate") {
      const obj = body as Record<string, unknown>;
      const data = obj.data as unknown[] | undefined;
      const first = data?.[0] as Record<string, unknown> | undefined;
      const b64 =
        typeof first?.b64_json === "string" ? first.b64_json : undefined;
      if (!b64) {
        return {
          status: "error",
          errorMessage: "openai-compat image: no b64_json",
        };
      }
      return {
        status: "ok",
        imageBytes: base64ToArrayBuffer(b64),
        imageMime: "image/png",
        usage: { requests: 1 },
      };
    }

    const parsed = contentFromChoices(body);
    if (parsed.error && parsed.text === undefined) {
      return { status: "error", errorMessage: parsed.error };
    }
    return {
      status: "ok",
      text: parsed.text ?? "",
      model: parsed.model,
      usage: parsed.usage ?? { requests: 1 },
    };
  },

  parseSseEvent(cap: AICapability, data: string) {
    void cap;
    try {
      const obj = JSON.parse(data) as Record<string, unknown>;
      if (obj.error) {
        if (typeof obj.error === "string") return { error: obj.error };
        const e = obj.error as Record<string, unknown>;
        return { error: String(e.message ?? "SSE error") };
      }
      const choices = obj.choices;
      let delta = "";
      if (Array.isArray(choices) && choices[0]) {
        const c0 = choices[0] as Record<string, unknown>;
        const d = c0.delta as Record<string, unknown> | undefined;
        if (typeof d?.content === "string") delta = d.content;
        else if (typeof c0.text === "string") delta = c0.text;
      }
      const finish =
        Array.isArray(choices) &&
        choices[0] &&
        (choices[0] as Record<string, unknown>).finish_reason != null &&
        (choices[0] as Record<string, unknown>).finish_reason !== "";
      return {
        delta: delta || undefined,
        done: Boolean(finish),
        usage: obj.usage ? usageFrom(obj) : undefined,
        model: typeof obj.model === "string" ? obj.model : undefined,
      };
    } catch {
      return { error: `Invalid SSE JSON: ${data.slice(0, 80)}` };
    }
  },

  estimate(
    cap: AICapability,
    req: CapRequest,
    _config: ProviderConfig,
  ): CostEstimate {
    void cap;
    // Rough: ~4 chars/token prompt + maxTokens ceiling
    const promptTokens = Math.ceil(req.prompt.length / 4);
    const maxOut = req.maxTokens ?? 256;
    return {
      unit: "tokens",
      amount: promptTokens + maxOut,
      estimated: true,
    };
  },
};
