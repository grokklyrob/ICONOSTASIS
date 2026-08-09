import { describe, expect, it, vi } from "vitest";
import {
  descriptorHasRawSecret,
  FetchBoundary,
  FetchBoundaryError,
} from "./fetchBoundary.js";
import type { FetchDescriptor } from "./types.js";
import { SessionVault } from "./vault.js";

describe("FetchBoundary AMD-06", () => {
  it("injects Authorization header from vault only at boundary", async () => {
    const vault = new SessionVault();
    const secret = "sk-live-super-secret-key-xyz";
    const ref = vault.put("openai", secret);

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${secret}`);
      expect(headers["Content-Type"]).toBe("application/json");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const boundary = new FetchBoundary(vault, fetchImpl);
    const desc: FetchDescriptor = {
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "x", messages: [] }),
      secretInjections: [
        { kind: "header", name: "Authorization", prefix: "Bearer " },
      ],
      responseMode: "json",
    };

    // Descriptor must not contain raw secret before boundary
    expect(descriptorHasRawSecret(desc, secret)).toBe(false);

    const res = await boundary.execute(desc, ref, new AbortController().signal);
    expect(res.mode).toBe("json");
    if (res.mode === "json") {
      expect(res.ok).toBe(true);
      expect(res.body).toEqual({ ok: true });
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("allows no-auth local endpoints with null SecretRef", async () => {
    const vault = new SessionVault();
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    });
    const boundary = new FetchBoundary(vault, fetchImpl);
    const desc: FetchDescriptor = {
      url: "http://127.0.0.1:11434/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      secretInjections: [],
      responseMode: "json",
    };
    const res = await boundary.execute(desc, null, new AbortController().signal);
    expect(res.ok).toBe(true);
  });

  it("throws when injections present but secret unresolved", async () => {
    const vault = new SessionVault();
    const boundary = new FetchBoundary(vault, vi.fn());
    const desc: FetchDescriptor = {
      url: "https://example.com",
      method: "POST",
      headers: {},
      secretInjections: [{ kind: "header", name: "Authorization", prefix: "Bearer " }],
      responseMode: "json",
    };
    await expect(
      boundary.execute(desc, null, new AbortController().signal),
    ).rejects.toBeInstanceOf(FetchBoundaryError);
  });

  it("reads SSE body as text", async () => {
    const vault = new SessionVault();
    const sse =
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n';
    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    const boundary = new FetchBoundary(vault, fetchImpl);
    const desc: FetchDescriptor = {
      url: "http://local/v1/chat/completions",
      method: "POST",
      headers: {},
      body: "{}",
      secretInjections: [],
      responseMode: "sse",
    };
    const res = await boundary.execute(desc, null, new AbortController().signal);
    expect(res.mode).toBe("sse");
    if (res.mode === "sse") {
      expect(res.text).toContain("Hi");
    }
  });
});
