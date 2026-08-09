/**
 * openai-compat contract tests against a mock OpenAI-compatible server (§19).
 */

import { describe, expect, it, vi } from "vitest";
import { createGenStack } from "../createGenStack.js";
import { descriptorHasRawSecret } from "../fetchBoundary.js";
import {
  OPENAI_COMPAT_ADAPTER_ID,
  openaiCompatAdapter,
} from "./openaiCompat.js";

describe("openai-compat adapter", () => {
  it("buildRequest never embeds raw secrets", () => {
    const secret = "sk-never-in-descriptor-aaaaaaaa";
    const desc = openaiCompatAdapter.buildRequest(
      "text.generate",
      { prompt: "vesper antiphon" },
      {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        requireAuth: true,
      },
    );
    expect(descriptorHasRawSecret(desc, secret)).toBe(false);
    expect(desc.secretInjections).toEqual([
      { kind: "header", name: "Authorization", prefix: "Bearer " },
    ]);
    expect(desc.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(desc.responseMode).toBe("json");
    const body = JSON.parse(desc.body ?? "{}") as { stream?: boolean };
    expect(body.stream).toBe(false);
  });

  it("local Ollama path uses no secret injection by default", () => {
    const desc = openaiCompatAdapter.buildRequest(
      "text.stream",
      { prompt: "hello", system: "be brief" },
      {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2",
        requireAuth: false,
      },
    );
    expect(desc.secretInjections).toEqual([]);
    expect(desc.responseMode).toBe("sse");
    expect(desc.url).toContain("11434");
  });

  it("parseJsonResponse extracts assistant content + usage", () => {
    const result = openaiCompatAdapter.parseJsonResponse(
      "text.generate",
      {
        model: "llama3.2",
        choices: [{ message: { role: "assistant", content: "Lumen." } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
        },
      },
      200,
    );
    expect(result.status).toBe("ok");
    expect(result.text).toBe("Lumen.");
    expect(result.usage?.totalTokens).toBe(14);
    expect(result.model).toBe("llama3.2");
  });

  it("end-to-end invoke via GenRuntime + mock fetch (auth)", async () => {
    const secret = "sk-test-mock-server-key-bbbbbbbb";
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${secret}`);
      const body = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
      };
      expect(body.messages.some((m) => m.content.includes("antiphon"))).toBe(
        true,
      );
      return new Response(
        JSON.stringify({
          model: "mock-1",
          choices: [
            { message: { role: "assistant", content: "Gloria in excelsis." } },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const stack = createGenStack({ fetchImpl });
    const ref = stack.vault.put("cloud", secret);
    stack.registry.upsertInstance({
      id: "mock-openai",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Mock OpenAI",
      config: {
        baseUrl: "https://mock.local/v1",
        model: "mock-1",
        requireAuth: true,
      },
      secretRef: ref,
      routing: "direct",
    });
    stack.arming.setMode("edit");

    const result = await stack.runtime.invoke({
      providerInstanceId: "mock-openai",
      cap: "text.generate",
      req: { prompt: "Write a one-line antiphon" },
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.text).toBe("Gloria in excelsis.");
    expect(stack.spend.snapshot().used).toBe(8);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("streaming SSE assembles deltas", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Ky"}}]}',
      'data: {"choices":[{"delta":{"content":"rie"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");

    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    );

    const stack = createGenStack({ fetchImpl });
    stack.registry.upsertInstance({
      id: "ollama",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Local Ollama",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });

    const deltas: string[] = [];
    const result = await stack.runtime.invoke({
      providerInstanceId: "ollama",
      cap: "text.stream",
      req: { prompt: "chant" },
      signal: new AbortController().signal,
      onDelta: (c) => deltas.push(c),
    });

    expect(result.status).toBe("ok");
    expect(result.text).toBe("Kyrie");
    expect(deltas).toEqual(["Ky", "rie"]);
  });

  it("disarmed perform blocks invoke without network", async () => {
    const fetchImpl = vi.fn();
    const stack = createGenStack({ fetchImpl });
    stack.registry.upsertInstance({
      id: "p",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "P",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "x",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });
    stack.arming.setMode("perform");
    // default disarmed
    const result = await stack.runtime.invoke({
      providerInstanceId: "p",
      cap: "text.generate",
      req: { prompt: "x" },
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("error");
    expect(result.controlBlocked).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("spend ceiling hard-stops without network", async () => {
    const fetchImpl = vi.fn();
    const stack = createGenStack({
      fetchImpl,
      spendUnit: "requests",
      spendCeiling: 1,
    });
    stack.registry.upsertInstance({
      id: "p",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "P",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "x",
        requireAuth: false,
      },
      secretRef: null,
      routing: "direct",
    });
    // Consume the one request
    stack.spend.record({ requests: 1 });
    const result = await stack.runtime.invoke({
      providerInstanceId: "p",
      cap: "text.generate",
      req: { prompt: "x" },
      signal: new AbortController().signal,
    });
    expect(result.controlBlocked).toBe(true);
    expect(result.errorMessage).toMatch(/Spend ceiling/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
