import { afterEach, describe, expect, it } from "vitest";
import { createHelperServer } from "./server.js";

describe("Local Helper §9.5", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) {
      const c = closers.pop();
      if (c) await c();
    }
  });

  it("rejects proxy when unpaired", async () => {
    const s = await createHelperServer();
    closers.push(() => s.close());
    const res = await fetch(`${s.baseUrl}/v1/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://example.com", method: "GET" }),
    });
    expect(res.status).toBe(401);
  });

  it("pairs and proxies JSON upstream", async () => {
    // Upstream mock
    const upstream = await createHelperServer(); // reuse as dummy? no — use real mock
    closers.push(() => upstream.close());

    // Simple upstream: the helper's own /health is not a good proxy target for POST.
    // Use httpbin-like: start a second tiny server via helper's listen of a custom path.
    // Instead pair helper and proxy to its own health with GET.
    const helper = await createHelperServer();
    closers.push(() => helper.close());

    const token = "test-pair-token-abcdef";
    const pairRes = await fetch(`${helper.baseUrl}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(pairRes.ok).toBe(true);

    const proxyRes = await fetch(`${helper.baseUrl}/v1/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Iconostasis-Pair": token,
      },
      body: JSON.stringify({
        url: `${helper.baseUrl}/health`,
        method: "GET",
        headers: {},
      }),
    });
    expect(proxyRes.ok).toBe(true);
    const body = (await proxyRes.json()) as {
      ok: boolean;
      bodyText: string;
      status: number;
    };
    expect(body.status).toBe(200);
    expect(JSON.parse(body.bodyText).ok).toBe(true);
  });
});
