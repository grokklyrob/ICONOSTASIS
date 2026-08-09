import { describe, expect, it } from "vitest";
import { createGenStack } from "../createGenStack.js";
import { descriptorHasRawSecret } from "../fetchBoundary.js";
import { startMockOpenAIServer } from "../test/mockOpenAIServer.js";
import { anthropicAdapter, ANTHROPIC_ADAPTER_ID } from "./anthropic.js";
import { extractJsonPath } from "./customHttp.js";
import { CUSTOM_HTTP_ADAPTER_ID } from "./customHttp.js";
import { googleAdapter, GOOGLE_ADAPTER_ID } from "./google.js";

describe("M2b adapters", () => {
  it("registers anthropic, google, custom-http by default", () => {
    const stack = createGenStack();
    expect(stack.registry.getAdapter(ANTHROPIC_ADAPTER_ID)).toBeTruthy();
    expect(stack.registry.getAdapter(GOOGLE_ADAPTER_ID)).toBeTruthy();
    expect(stack.registry.getAdapter(CUSTOM_HTTP_ADAPTER_ID)).toBeTruthy();
  });

  it("anthropic buildRequest never embeds secrets", () => {
    const secret = "sk-ant-never-in-descriptor-zzzz";
    const desc = anthropicAdapter.buildRequest(
      "text.generate",
      { prompt: "hi" },
      { model: "claude-test" },
    );
    expect(descriptorHasRawSecret(desc, secret)).toBe(false);
    expect(desc.secretInjections[0]?.kind).toBe("header");
    expect(desc.url).toContain("/v1/messages");
  });

  it("anthropic parseJsonResponse extracts text", () => {
    const r = anthropicAdapter.parseJsonResponse(
      "text.generate",
      {
        model: "claude-test",
        content: [{ type: "text", text: "Lumen" }],
        usage: { input_tokens: 3, output_tokens: 1 },
      },
      200,
    );
    expect(r.status).toBe("ok");
    expect(r.text).toBe("Lumen");
    expect(r.usage?.totalTokens).toBe(4);
  });

  it("google buildRequest uses query key injection", () => {
    const desc = googleAdapter.buildRequest(
      "text.generate",
      { prompt: "hi" },
      { model: "gemini-test" },
    );
    expect(desc.secretInjections).toEqual([{ kind: "query", name: "key" }]);
    expect(desc.url).toContain("generateContent");
  });

  it("custom-http extractJsonPath", () => {
    expect(extractJsonPath({ a: { b: ["x", { c: 1 }] } }, "a.b.1.c")).toBe(1);
  });

  it("custom-http end-to-end via GenRuntime", async () => {
    const mock = await startMockOpenAIServer({ replyText: "custom-ok" });
    // mock is openai chat — use custom path pointing at a tiny override
    // Build custom instance that hits mock chat and maps choices.0.message.content
    try {
      const stack = createGenStack();
      stack.registry.upsertInstance({
        id: "custom",
        adapterId: CUSTOM_HTTP_ADAPTER_ID,
        label: "Custom",
        config: {
          url: `${mock.baseUrl}/chat/completions`,
          method: "POST",
          bodyTemplate:
            '{"model":"m","messages":[{"role":"user","content":"{{prompt}}"}],"stream":false}',
          responsePath: "choices.0.message.content",
          responseKind: "text",
          requireAuth: false,
        },
        secretRef: null,
        routing: "direct",
      });
      const r = await stack.runtime.invoke({
        providerInstanceId: "custom",
        cap: "text.generate",
        req: { prompt: "hi" },
        signal: new AbortController().signal,
      });
      expect(r.status).toBe("ok");
      expect(r.text).toBe("custom-ok");
      expect(stack.provenance.list().length).toBe(1);
    } finally {
      await mock.close();
    }
  });
});
