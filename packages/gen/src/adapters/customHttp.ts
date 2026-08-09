/**
 * custom-http adapter — declarative endpoint templates (§9.3).
 * Request template slots: {{prompt}}, {{system}}, {{model}}, {{maxTokens}}, {{temperature}}.
 * Response: JSONPath-ish simple extractor (dot path).
 */

import { base64ToArrayBuffer } from "../bytes.js";
import { configString } from "../runtime.js";
import type {
  AICapability,
  CapRequest,
  CapResult,
  CostEstimate,
  FetchDescriptor,
  ProviderAdapter,
  ProviderConfig,
} from "../types.js";

export const CUSTOM_HTTP_ADAPTER_ID = "custom-http" as const;

const CAPS: readonly AICapability[] = [
  "text.generate",
  "image.generate",
  "speech.synthesize",
] as const;

function fillTemplate(template: string, req: CapRequest, config: ProviderConfig): string {
  const model = req.model ?? configString(config, "model", "");
  return template
    .replaceAll("{{prompt}}", JSON.stringify(req.prompt).slice(1, -1))
    .replaceAll("{{system}}", JSON.stringify(req.system ?? "").slice(1, -1))
    .replaceAll("{{model}}", model)
    .replaceAll("{{maxTokens}}", String(req.maxTokens ?? 256))
    .replaceAll(
      "{{temperature}}",
      String(req.temperature ?? 0.7),
    );
}

/** Minimal JSON path: a.b.c or a.0.b */
export function extractJsonPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(p);
      cur = cur[i];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export const customHttpAdapter: ProviderAdapter = {
  id: CUSTOM_HTTP_ADAPTER_ID,
  capabilities: CAPS,
  configSchema: {
    fields: [
      {
        id: "url",
        label: "URL",
        type: "url",
        required: true,
        default: "https://example.com/v1/generate",
      },
      {
        id: "method",
        label: "Method",
        type: "string",
        default: "POST",
      },
      {
        id: "bodyTemplate",
        label: "Body template JSON",
        type: "string",
        default: '{"prompt":"{{prompt}}","model":"{{model}}"}',
      },
      {
        id: "responsePath",
        label: "JSON path to text/result",
        type: "string",
        default: "text",
      },
      {
        id: "responseKind",
        label: "Result kind",
        type: "string",
        default: "text",
        description: "text | imageBase64 | audioBase64",
      },
      {
        id: "authHeader",
        label: "Auth header name",
        type: "string",
        default: "Authorization",
      },
      {
        id: "authPrefix",
        label: "Auth header prefix",
        type: "string",
        default: "Bearer ",
      },
      {
        id: "requireAuth",
        label: "Require API key",
        type: "boolean",
        default: true,
      },
      {
        id: "model",
        label: "Model",
        type: "string",
        default: "",
      },
    ],
  },

  buildRequest(
    cap: AICapability,
    req: CapRequest,
    config: ProviderConfig,
  ): FetchDescriptor {
    void cap;
    const url = fillTemplate(
      configString(config, "url", "https://example.com/v1/generate"),
      req,
      config,
    );
    const method = (configString(config, "method", "POST").toUpperCase() ||
      "POST") as FetchDescriptor["method"];
    const bodyTemplate = configString(
      config,
      "bodyTemplate",
      '{"prompt":"{{prompt}}"}',
    );
    const body = fillTemplate(bodyTemplate, req, config);
    const requireAuth = config.requireAuth !== false;
    const authHeader = configString(config, "authHeader", "Authorization");
    const authPrefix = configString(config, "authPrefix", "Bearer ");

    return {
      url,
      method: method === "GET" || method === "PUT" || method === "DELETE" ? method : "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "GET" ? undefined : body,
      secretInjections: requireAuth
        ? [{ kind: "header", name: authHeader, prefix: authPrefix }]
        : [],
      responseMode: "json",
    };
  },

  parseJsonResponse(
    cap: AICapability,
    body: unknown,
    httpStatus: number,
  ): CapResult {
    if (httpStatus < 200 || httpStatus >= 300) {
      return {
        status: "error",
        errorMessage:
          typeof body === "object" && body
            ? JSON.stringify(body).slice(0, 200)
            : `HTTP ${httpStatus}`,
      };
    }
    // responsePath / responseKind come from config — not available here.
    // Convention: use standard fields, or config via extra on parse is N/A.
    // Store last path on adapter is not thread-safe; use sensible defaults.
    const pathGuess =
      cap === "image.generate"
        ? "image"
        : cap === "speech.synthesize"
          ? "audio"
          : "text";
    const extracted =
      extractJsonPath(body, pathGuess) ??
      extractJsonPath(body, "data") ??
      extractJsonPath(body, "result") ??
      extractJsonPath(body, "choices.0.message.content");

    if (cap === "image.generate") {
      const b64 =
        typeof extracted === "string"
          ? extracted
          : typeof (extracted as { b64?: string })?.b64 === "string"
            ? (extracted as { b64: string }).b64
            : undefined;
      if (!b64) {
        return { status: "error", errorMessage: "custom-http: no image data" };
      }
      return {
        status: "ok",
        imageBytes: base64ToArrayBuffer(b64),
        imageMime: "image/png",
        usage: { requests: 1 },
      };
    }
    if (cap === "speech.synthesize") {
      const b64 = typeof extracted === "string" ? extracted : undefined;
      if (!b64) {
        return { status: "error", errorMessage: "custom-http: no audio data" };
      }
      return {
        status: "ok",
        audioBytes: base64ToArrayBuffer(b64),
        audioMime: "audio/mpeg",
        usage: { requests: 1 },
      };
    }
    return {
      status: "ok",
      text: extracted !== undefined ? String(extracted) : "",
      usage: { requests: 1 },
    };
  },

  estimate(
    _cap: AICapability,
    req: CapRequest,
    _config: ProviderConfig,
  ): CostEstimate {
    return {
      unit: "requests",
      amount: 1,
      estimated: true,
    };
  },
};

/**
 * Parse with explicit path/kind from instance config (used by runtime).
 */
export function parseCustomHttpWithConfig(
  body: unknown,
  httpStatus: number,
  config: ProviderConfig,
  cap: AICapability,
): CapResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    return customHttpAdapter.parseJsonResponse(cap, body, httpStatus);
  }
  const path = configString(config, "responsePath", "text");
  const kind = configString(config, "responseKind", "text");
  const extracted = extractJsonPath(body, path);
  if (kind === "imageBase64" || cap === "image.generate") {
    const b64 = typeof extracted === "string" ? extracted : undefined;
    if (!b64) return { status: "error", errorMessage: "no image at path" };
    return {
      status: "ok",
      imageBytes: base64ToArrayBuffer(b64),
      imageMime: "image/png",
      usage: { requests: 1 },
    };
  }
  if (kind === "audioBase64" || cap === "speech.synthesize") {
    const b64 = typeof extracted === "string" ? extracted : undefined;
    if (!b64) return { status: "error", errorMessage: "no audio at path" };
    return {
      status: "ok",
      audioBytes: base64ToArrayBuffer(b64),
      audioMime: "audio/mpeg",
      usage: { requests: 1 },
    };
  }
  return {
    status: "ok",
    text: extracted !== undefined ? String(extracted) : "",
    usage: { requests: 1 },
  };
}
