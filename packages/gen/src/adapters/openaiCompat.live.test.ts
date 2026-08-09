/**
 * Live path: real TCP mock OpenAI-compat server (§19 adapter contracts).
 *
 * Optional live provider smoke (AMD-30): provider-agnostic, since the adapter
 * is. Set ICONOSTASIS_SMOKE_BASE_URL (+ _MODEL, + _API_KEY for cloud hosts).
 * Skips cleanly when unset — §19 marks this CI-optional.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createGenStack } from "../createGenStack.js";
import { startMockOpenAIServer } from "../test/mockOpenAIServer.js";
import { OPENAI_COMPAT_ADAPTER_ID } from "./openaiCompat.js";

const smokeBase = process.env.ICONOSTASIS_SMOKE_BASE_URL?.replace(/\/+$/, "");
const smokeModel = process.env.ICONOSTASIS_SMOKE_MODEL;
const smokeKey = process.env.ICONOSTASIS_SMOKE_API_KEY;


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

describe("openai-compat live provider smoke (optional)", () => {
  it("invokes text.generate against a configured real endpoint", async () => {
    // §19 CI-optional. BYOK: never invent a key, never spend without opt-in.
    if (!smokeBase || !smokeModel) return;

    const stack = createGenStack();
    const secretRef = smokeKey ? stack.vault.put("smoke", smokeKey) : null;
    stack.registry.upsertInstance({
      id: "smoke",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Live smoke target",
      config: {
        baseUrl: smokeBase,
        model: smokeModel,
        requireAuth: secretRef !== null,
      },
      secretRef,
      routing: "direct",
    });
    stack.arming.setMode("edit");

    const result = await stack.runtime.invoke({
      providerInstanceId: "smoke",
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
      `live invoke failed (${smokeBase}, model=${smokeModel}): ${result.errorMessage ?? ""}`,
    ).toBe("ok");
    expect(result.text && result.text.length > 0).toBe(true);
    expect(stack.spend.snapshot().used).toBeGreaterThan(0);
  }, 130_000);
});
