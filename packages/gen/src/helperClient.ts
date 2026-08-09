/**
 * Local Helper client (§9.5) — pairs with packages/helper.
 * Routing `helper` rewrites provider fetch through localhost proxy.
 */

export interface HelperConfig {
  /** e.g. http://127.0.0.1:47821 */
  baseUrl: string;
  /** One-time pairing token from app. */
  pairToken: string;
}

export interface HelperProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
}

export interface HelperProxyResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  bodyText: string;
  bodyBase64?: string;
  binary: boolean;
}

export class HelperClient {
  constructor(
    private config: HelperConfig | null,
    private fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  setConfig(config: HelperConfig | null): void {
    this.config = config;
  }

  getConfig(): HelperConfig | null {
    return this.config;
  }

  async probe(): Promise<{ ok: boolean; paired: boolean; error?: string }> {
    if (!this.config) return { ok: false, paired: false, error: "not configured" };
    try {
      const res = await this.fetchImpl(
        `${this.config.baseUrl.replace(/\/+$/, "")}/health`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (!res.ok) return { ok: false, paired: false, error: `HTTP ${res.status}` };
      const j = (await res.json()) as { paired?: boolean };
      return { ok: true, paired: Boolean(j.paired) };
    } catch (err) {
      return {
        ok: false,
        paired: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async pair(token: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.config) return { ok: false, error: "not configured" };
    try {
      const res = await this.fetchImpl(
        `${this.config.baseUrl.replace(/\/+$/, "")}/pair`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) {
        return { ok: false, error: `pair HTTP ${res.status}` };
      }
      this.config = { ...this.config, pairToken: token };
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async proxy(
    req: HelperProxyRequest,
    signal: AbortSignal,
  ): Promise<HelperProxyResponse> {
    if (!this.config?.pairToken) {
      throw new Error("HelperClient: not paired");
    }
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const res = await this.fetchImpl(`${base}/v1/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Iconostasis-Pair": this.config.pairToken,
      },
      body: JSON.stringify(req),
      signal,
    });
    const j = (await res.json()) as HelperProxyResponse & { error?: string };
    if (!res.ok && j.error) {
      throw new Error(`Helper proxy: ${j.error}`);
    }
    return {
      status: j.status ?? res.status,
      ok: Boolean(j.ok),
      headers: j.headers ?? {},
      bodyText: j.bodyText ?? "",
      bodyBase64: j.bodyBase64,
      binary: Boolean(j.binary),
    };
  }
}
