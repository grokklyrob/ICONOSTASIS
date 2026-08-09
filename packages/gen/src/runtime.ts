/**
 * GenRuntime — orchestrates arming, spend, descriptor build, fetch boundary,
 * helper routing, provenance, and response parse (§9.2, §9.5, §12.4).
 */

import { parseCustomHttpWithConfig } from "./adapters/customHttp.js";
import { CUSTOM_HTTP_ADAPTER_ID } from "./adapters/customHttp.js";
import type { ArmingController } from "./arming.js";
import { base64ToArrayBuffer, utf8ToArrayBuffer } from "./bytes.js";
import type { FetchBoundary } from "./fetchBoundary.js";
import { FetchBoundaryError } from "./fetchBoundary.js";
import type { HelperClient } from "./helperClient.js";
import type { ProvenanceLedger } from "./provenance.js";
import type { ProviderRegistry } from "./registry.js";
import type { SpendCeiling } from "./spend.js";
import type {
  AICapability,
  CapRequest,
  CapResult,
  CapUsage,
  FetchDescriptor,
  ProviderAdapter,
  ProviderConfig,
  ProviderInstance,
} from "./types.js";

export interface GenInvokeOptions {
  providerInstanceId: string;
  cap: AICapability;
  req: CapRequest;
  signal: AbortSignal;
  opId?: string;
  onDelta?: (chunk: string) => void;
}

export class GenRuntime {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly boundary: FetchBoundary,
    private readonly spend: SpendCeiling,
    private readonly arming: ArmingController,
    private readonly helper: HelperClient | null = null,
    private readonly provenance: ProvenanceLedger | null = null,
  ) {}

  async invoke(opts: GenInvokeOptions): Promise<CapResult> {
    let providerInstanceId = opts.providerInstanceId;
    if (!providerInstanceId) {
      const fallback = this.registry
        .listInstances()
        .find((i) => {
          const ad = this.registry.getAdapter(i.adapterId);
          return ad?.capabilities.includes(opts.cap);
        });
      if (!fallback) {
        return {
          status: "error",
          errorMessage: `No provider for capability ${opts.cap}`,
        };
      }
      providerInstanceId = fallback.id;
    }

    const inst = this.registry.getInstance(providerInstanceId);
    if (!inst) {
      return {
        status: "error",
        errorMessage: `Unknown provider instance "${providerInstanceId}"`,
      };
    }

    if (!this.arming.isArmed(opts.opId)) {
      return this.arming.disarmedResult(inst.id);
    }

    const adapter = this.registry.getAdapter(inst.adapterId);
    if (!adapter) {
      return {
        status: "error",
        errorMessage: `Adapter "${inst.adapterId}" not registered`,
        providerId: inst.id,
      };
    }

    if (!adapter.capabilities.includes(opts.cap)) {
      return {
        status: "error",
        errorMessage: `Adapter "${adapter.id}" does not support ${opts.cap}`,
        providerId: inst.id,
      };
    }

    const estimate = adapter.estimate?.(opts.cap, opts.req, inst.config);
    if (!this.spend.canInvoke(estimate)) {
      return this.spend.hardStopResult(inst.id);
    }

    let desc: FetchDescriptor;
    try {
      desc = adapter.buildRequest(opts.cap, opts.req, inst.config);
    } catch (err) {
      return {
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        providerId: inst.id,
      };
    }

    let boundaryRes;
    try {
      if (inst.routing === "helper") {
        boundaryRes = await this.executeViaHelper(
          desc,
          inst,
          opts.signal,
        );
      } else {
        boundaryRes = await this.boundary.execute(
          desc,
          inst.secretRef,
          opts.signal,
        );
      }
    } catch (err) {
      if (opts.signal.aborted) {
        return {
          status: "aborted",
          errorMessage: "aborted",
          providerId: inst.id,
        };
      }
      const msg =
        err instanceof FetchBoundaryError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        status: "error",
        errorMessage: msg,
        providerId: inst.id,
      };
    }

    let tagged: CapResult;

    if (boundaryRes.mode === "sse") {
      tagged = this.finishSse(
        adapter,
        inst,
        opts,
        boundaryRes.httpStatus,
        boundaryRes.ok,
        boundaryRes.text,
      );
    } else if (boundaryRes.mode === "binary") {
      tagged = {
        status: boundaryRes.ok ? "ok" : "error",
        audioBytes: boundaryRes.ok ? boundaryRes.bytes : undefined,
        audioMime:
          boundaryRes.headers.get("content-type") ?? "application/octet-stream",
        errorMessage: boundaryRes.ok
          ? undefined
          : `HTTP ${boundaryRes.httpStatus}`,
        providerId: inst.id,
        usage: { requests: 1 },
      };
      if (tagged.status === "ok") this.spend.record(tagged.usage);
    } else if (boundaryRes.mode === "json") {
      let result: CapResult;
      if (adapter.id === CUSTOM_HTTP_ADAPTER_ID) {
        result = parseCustomHttpWithConfig(
          boundaryRes.body,
          boundaryRes.httpStatus,
          inst.config,
          opts.cap,
        );
      } else {
        result = adapter.parseJsonResponse(
          opts.cap,
          boundaryRes.body,
          boundaryRes.httpStatus,
        );
      }
      tagged = {
        ...result,
        providerId: result.providerId ?? inst.id,
      };
      if (tagged.status === "ok") {
        this.spend.record(tagged.usage);
      }
    } else {
      return {
        status: "error",
        errorMessage: `Unsupported response mode for ${opts.cap}`,
        providerId: inst.id,
      };
    }

    if (tagged.status === "ok" && this.provenance) {
      const material =
        tagged.text ??
        (tagged.audioBytes
          ? `audio:${tagged.audioBytes.byteLength}`
          : "ok");
      await this.provenance.recordSuccess({
        capability: opts.cap,
        providerClass: inst.adapterId,
        modelId: tagged.model ?? String(inst.config.model ?? ""),
        prompt: opts.req.prompt,
        params: {
          temperature: opts.req.temperature,
          maxTokens: opts.req.maxTokens,
        },
        seed: opts.req.seed,
        opId: opts.opId,
        artifactMaterial: tagged.imageBytes ?? tagged.audioBytes ?? material,
        nondeterministic: opts.req.seed === undefined,
      });
    }

    return tagged;
  }

  /**
   * Resolve secrets at boundary, then POST through Local Helper (§9.5).
   * Helper does not persist keys by default — secrets ride on the outbound hop only.
   */
  private async executeViaHelper(
    desc: FetchDescriptor,
    inst: ProviderInstance,
    signal: AbortSignal,
  ) {
    if (!this.helper?.getConfig()?.pairToken) {
      throw new FetchBoundaryError(
        "Helper routing requires a paired Local Helper (§9.5)",
      );
    }

    const captured = this.boundary.materialize(desc, inst.secretRef);

    const proxy = await this.helper.proxy(
      {
        url: captured.url,
        method: captured.method,
        headers: captured.headers,
        body: captured.body ?? null,
      },
      signal,
    );

    if (desc.responseMode === "binary") {
      return {
        mode: "binary" as const,
        httpStatus: proxy.status,
        ok: proxy.ok,
        bytes: proxy.bodyBase64
          ? base64ToArrayBuffer(proxy.bodyBase64)
          : utf8ToArrayBuffer(proxy.bodyText),
        headers: new Headers(proxy.headers),
      };
    }

    if (desc.responseMode === "sse") {
      return {
        mode: "sse" as const,
        httpStatus: proxy.status,
        ok: proxy.ok,
        text: proxy.bodyText,
        headers: new Headers(proxy.headers),
      };
    }

    let parsed: unknown = null;
    if (proxy.bodyText.length > 0) {
      try {
        parsed = JSON.parse(proxy.bodyText) as unknown;
      } catch {
        parsed = { raw: proxy.bodyText };
      }
    }
    return {
      mode: "json" as const,
      httpStatus: proxy.status,
      ok: proxy.ok,
      body: parsed,
      headers: new Headers(proxy.headers),
    };
  }

  private finishSse(
    adapter: ProviderAdapter,
    inst: ProviderInstance,
    opts: GenInvokeOptions,
    httpStatus: number,
    ok: boolean,
    text: string,
  ): CapResult {
    if (!adapter.parseSseEvent) {
      return {
        status: "error",
        errorMessage: `Adapter "${adapter.id}" has no SSE parser`,
        providerId: inst.id,
      };
    }

    if (!ok) {
      try {
        const j = JSON.parse(text) as unknown;
        const parsed = adapter.parseJsonResponse(opts.cap, j, httpStatus);
        return { ...parsed, providerId: inst.id };
      } catch {
        return {
          status: "error",
          errorMessage: `HTTP ${httpStatus}: ${text.slice(0, 200)}`,
          providerId: inst.id,
        };
      }
    }

    let assembled = "";
    let usage: CapUsage | undefined;
    let model: string | undefined;
    let sawError: string | undefined;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") break;
      const ev = adapter.parseSseEvent(opts.cap, data);
      if (ev.error) {
        sawError = ev.error;
        break;
      }
      if (ev.delta) {
        assembled += ev.delta;
        opts.onDelta?.(ev.delta);
      }
      if (ev.usage) usage = ev.usage;
      if (ev.model) model = ev.model;
    }

    if (sawError) {
      return {
        status: "error",
        errorMessage: sawError,
        providerId: inst.id,
        text: assembled || undefined,
      };
    }

    const result: CapResult = {
      status: "ok",
      text: assembled,
      usage: usage ?? { requests: 1 },
      model,
      providerId: inst.id,
    };
    this.spend.record(result.usage);
    return result;
  }
}

export function configString(
  config: ProviderConfig,
  key: string,
  fallback = "",
): string {
  const v = config[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}
