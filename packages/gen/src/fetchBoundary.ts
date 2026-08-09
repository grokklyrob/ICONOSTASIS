/**
 * Single fetch boundary (architecture.md §9.2, AMD-06).
 * Only this module resolves SecretRef and performs provider TLS.
 * Adapters build FetchDescriptor; they never see raw secrets or call fetch.
 */

import type { SessionVault } from "./vault.js";
import type { FetchDescriptor, SecretRef } from "./types.js";

export type FetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class FetchBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBoundaryError";
  }
}

export interface BoundaryJsonResponse {
  mode: "json";
  httpStatus: number;
  ok: boolean;
  body: unknown;
  headers: Headers;
}

export interface BoundarySseResponse {
  mode: "sse";
  httpStatus: number;
  ok: boolean;
  /** Full response text (SSE stream body). */
  text: string;
  headers: Headers;
}

export interface BoundaryBinaryResponse {
  mode: "binary";
  httpStatus: number;
  ok: boolean;
  bytes: ArrayBuffer;
  headers: Headers;
}

export type BoundaryResponse =
  | BoundaryJsonResponse
  | BoundarySseResponse
  | BoundaryBinaryResponse;

function applyAll(
  desc: FetchDescriptor,
  secret: string | undefined,
): { url: string; headers: Record<string, string>; body?: string } {
  if (!secret) {
    if (desc.secretInjections.length > 0) {
      throw new FetchBoundaryError(
        "FetchBoundary: SecretRef required but missing/unresolved",
      );
    }
    return {
      url: desc.url,
      headers: { ...desc.headers },
      body: desc.body,
    };
  }

  const headers = { ...desc.headers };
  let url = desc.url;
  const body = desc.body;

  for (const inj of desc.secretInjections) {
    if (inj.kind === "header") {
      headers[inj.name] = `${inj.prefix ?? ""}${secret}`;
    } else if (inj.kind === "query") {
      const u = new URL(url);
      u.searchParams.set(inj.name, secret);
      url = u.toString();
    }
  }

  return { url, headers, body };
}

export interface MaterializedRequest {
  url: string;
  method: FetchDescriptor["method"];
  headers: Record<string, string>;
  body?: string;
}

export class FetchBoundary {
  constructor(
    private readonly vault: SessionVault,
    private readonly fetchImpl: FetchImpl = globalThis.fetch.bind(globalThis),
  ) {}

  /**
   * Resolve SecretRef and apply injections without network I/O.
   * Used by helper routing to forward the fully-formed request (§9.5).
   */
  materialize(
    desc: FetchDescriptor,
    secretRef: SecretRef | null,
  ): MaterializedRequest {
    let secret: string | undefined;
    if (secretRef !== null) {
      secret = this.vault.resolveForBoundary(secretRef);
      if (secret === undefined) {
        throw new FetchBoundaryError(
          "FetchBoundary: SecretRef not found in vault",
        );
      }
    }
    const { url, headers, body } = applyAll(desc, secret);
    return { url, method: desc.method, headers, body };
  }

  /**
   * Execute a descriptor. Resolves SecretRef from vault when provided.
   * Local no-auth endpoints may pass secretRef=null with empty injections.
   */
  async execute(
    desc: FetchDescriptor,
    secretRef: SecretRef | null,
    signal: AbortSignal,
  ): Promise<BoundaryResponse> {
    const { url, headers, body } = this.materialize(desc, secretRef);

    // Defense: never leave a raw secret string in thrown messages from URL
    // construction — applyAll only puts secrets in headers/query.

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: desc.method,
        headers,
        body: body ?? null,
        signal,
      });
    } catch (err) {
      if (signal.aborted) {
        throw new FetchBoundaryError("FetchBoundary: aborted");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new FetchBoundaryError(`FetchBoundary: network error: ${msg}`);
    }

    if (desc.responseMode === "json") {
      let parsed: unknown = null;
      const text = await res.text();
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = { raw: text };
        }
      }
      return {
        mode: "json",
        httpStatus: res.status,
        ok: res.ok,
        body: parsed,
        headers: res.headers,
      };
    }

    if (desc.responseMode === "sse") {
      const text = await res.text();
      return {
        mode: "sse",
        httpStatus: res.status,
        ok: res.ok,
        text,
        headers: res.headers,
      };
    }

    const bytes = await res.arrayBuffer();
    return {
      mode: "binary",
      httpStatus: res.status,
      ok: res.ok,
      bytes,
      headers: res.headers,
    };
  }
}

/** Test helper: ensure a value does not appear to be a raw secret leak path. */
export function descriptorHasRawSecret(
  desc: FetchDescriptor,
  secret: string,
): boolean {
  if (!secret) return false;
  if (desc.url.includes(secret)) return true;
  if (desc.body?.includes(secret)) return true;
  for (const v of Object.values(desc.headers)) {
    if (v.includes(secret)) return true;
  }
  return false;
}
