/**
 * Live path: real TCP mock OpenAI-compat server (§19 adapter contracts).
 * Optional real Ollama: set ICONOSTASIS_OLLAMA_SMOKE=1 (or auto when daemon up).
 */

import { afterEach, describe, expect, it } from "vitest";
import { createGenStack } from "../createGenStack.js";
import { startMockOpenAIServer } from "../test/mockOpenAIServer.js";
import { OPENAI_COMPAT_ADAPTER_ID } from "./openaiCompat.js";

const ollamaBase =
  process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";
const ollamaV1 = ollamaBase.endsWith("/v1") ? ollamaBase : `${ollamaBase}/v1`;
const forceOllama = process.env.ICONOSTASIS_OLLAMA_SMOKE === "1";

async function ollamaModels(): Promise<string[] | null> {
  try {
    const res = await fetch(`${ollamaBase.replace(/\/v1$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      models?: { name?: string }[];
    };
    return (body.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
  } catch {
    return null;
  }
}

describe("openai-compat live TCP path", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) {
      const c = closers.pop();
      if (c) await c();
    }
  });

  it("text.generate over real HTTP with SecretRef auth injection", async () => {
    const secret = "sk-mock-live-secret-cccccccc";
    const mock = await startMockOpenAIServer({
      replyText: "lumen",
      requireAuth: true,
      expectedBearer: secret,
    });
    closers.push(() => mock.close());

    const stack = createGenStack(); // real global fetch
    const ref = stack.vault.put("mock", secret);
    stack.registry.upsertInstance({
      id: "mock-live",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Mock live",
      config: {
        baseUrl: mock.baseUrl,
        model: "mock-1",
        requireAuth: true,
      },
      secretRef: ref,
      routing: "direct",
    });

    const result = await stack.runtime.invoke({
      providerInstanceId: "mock-live",
      cap: "text.generate",
      req: { prompt: "Reply with exactly one word: lumen", maxTokens: 8 },
      signal: AbortSignal.timeout(10_000),
    });

    expect(result.status).toBe("ok");
    expect(result.text).toBe("lumen");
    expect(result.usage?.totalTokens).toBe(10);
    expect(mock.authHeaders[0]).toBe(`Bearer ${secret}`);
    expect(stack.spend.snapshot().used).toBe(10);
  });

  it("text.stream over real HTTP assembles SSE", async () => {
    const mock = await startMockOpenAIServer({ replyText: "Kyrie" });
    closers.push(() => mock.close());

    const stack = createGenStack();
    stack.registry.upsertInstance({
      id: "mock-stream",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Mock stream",
      config: {
        baseUrl: mock.baseUrl,
        model: "mock-1",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });

    const deltas: string[] = [];
    const result = await stack.runtime.invoke({
      providerInstanceId: "mock-stream",
      cap: "text.stream",
      req: { prompt: "chant" },
      signal: AbortSignal.timeout(10_000),
      onDelta: (d) => deltas.push(d),
    });

    expect(result.status).toBe("ok");
    expect(result.text).toBe("Kyrie");
    expect(deltas.join("")).toBe("Kyrie");
  });

  it("perform disarmed blocks before any HTTP", async () => {
    const mock = await startMockOpenAIServer();
    closers.push(() => mock.close());
    let hits = 0;
    // Wrap: if somehow called, count — but disarmed should not reach server
    const stack = createGenStack();
    stack.registry.upsertInstance({
      id: "m",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "m",
      config: {
        baseUrl: mock.baseUrl,
        model: "x",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });
    stack.arming.setMode("perform");
    const result = await stack.runtime.invoke({
      providerInstanceId: "m",
      cap: "text.generate",
      req: { prompt: "x" },
      signal: AbortSignal.timeout(5_000),
    });
    expect(result.controlBlocked).toBe(true);
    expect(mock.authHeaders.length + hits).toBe(0);
  });
});

describe("openai-compat Ollama smoke (optional)", () => {
  it("live Ollama text.generate when daemon + model available", async () => {
    const models = await ollamaModels();
    if (models === null || models.length === 0) {
      if (forceOllama) {
        throw new Error(
          "ICONOSTASIS_OLLAMA_SMOKE=1 but Ollama unreachable or has no models",
        );
      }
      // §19 CI-optional: skip cleanly when Ollama is not installed
      return;
    }

    const preferred = process.env.OLLAMA_MODEL;
    const model =
      (preferred && models.some((m) => m === preferred || m.startsWith(`${preferred}:`))
        ? preferred
        : null) ??
      models.find((m) => m.startsWith("smollm")) ??
      models[0]!;

    const stack = createGenStack();
    stack.registry.upsertInstance({
      id: "ollama",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Ollama",
      config: {
        baseUrl: ollamaV1,
        model,
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });
    stack.arming.setMode("edit");

    const result = await stack.runtime.invoke({
      providerInstanceId: "ollama",
      cap: "text.generate",
      req: {
        prompt: "Reply with exactly one word: lumen",
        maxTokens: 16,
        temperature: 0,
      },
      signal: AbortSignal.timeout(120_000),
    });

    expect(
      result.status,
      `Ollama invoke failed (model=${model}): ${result.errorMessage ?? ""}`,
    ).toBe("ok");
    expect(result.text && result.text.length > 0).toBe(true);
    expect(stack.spend.snapshot().used).toBeGreaterThan(0);
  }, 130_000);
});
