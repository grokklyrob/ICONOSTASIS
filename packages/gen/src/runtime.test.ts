import { describe, expect, it, vi } from "vitest";
import { createGenStack } from "./createGenStack.js";
import { OPENAI_COMPAT_ADAPTER_ID } from "./adapters/openaiCompat.js";

describe("GenRuntime orchestration", () => {
  it("helper routing fails closed in M2a", async () => {
    const stack = createGenStack({ fetchImpl: vi.fn() });
    stack.registry.upsertInstance({
      id: "h",
      adapterId: OPENAI_COMPAT_ADAPTER_ID,
      label: "Helper path",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "x",
        requireAuth: false,
      },
      secretRef: null,
      routing: "helper",
    });
    const r = await stack.runtime.invoke({
      providerInstanceId: "h",
      cap: "text.generate",
      req: { prompt: "x" },
      signal: new AbortController().signal,
    });
    expect(r.status).toBe("error");
    expect(r.errorMessage).toMatch(/Helper|paired/i);
  });

  it("unknown instance errors", async () => {
    const stack = createGenStack({ fetchImpl: vi.fn() });
    const r = await stack.runtime.invoke({
      providerInstanceId: "nope",
      cap: "text.generate",
      req: { prompt: "x" },
      signal: new AbortController().signal,
    });
    expect(r.status).toBe("error");
    expect(r.errorMessage).toMatch(/Unknown provider/);
  });
});
