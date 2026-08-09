/**
 * Local Helper HTTP server (§9.5).
 * - localhost only
 * - pairing token required for /v1/proxy
 * - does not persist provider API keys (forwards app-supplied headers)
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

import { handleMockRequest, MOCK_BASE_PATH } from "./mockGen.mjs";

export { MOCK_BASE_PATH };

export interface HelperServerOptions {
  host?: string;
  port?: number;
  /** Expected pair token; null until paired. */
  pairToken?: string | null;
}

export interface HelperServer {
  baseUrl: string;
  port: number;
  getPairToken(): string | null;
  setPairToken(token: string | null): void;
  close(): Promise<void>;
}

export function createHelperServer(
  opts: HelperServerOptions = {},
): Promise<HelperServer> {
  const host = opts.host ?? "127.0.0.1";
  let pairToken: string | null = opts.pairToken ?? null;

  const server = http.createServer(async (req, res) => {
    // Localhost only is enforced by listen bind; reject non-local just in case.
    const remote = req.socket.remoteAddress ?? "";
    if (
      remote !== "127.0.0.1" &&
      remote !== "::1" &&
      remote !== ":ffff:127.0.0.1"
    ) {
      res.writeHead(403);
      res.end("localhost only");
      return;
    }

    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, paired: Boolean(pairToken) }));
      return;
    }

    if (req.method === "POST" && url === "/pair") {
      const body = await readBody(req);
      try {
        const j = JSON.parse(body) as { token?: string };
        if (!j.token || j.token.length < 8) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "token required (min 8 chars)" }));
          return;
        }
        pairToken = j.token;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, paired: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
      return;
    }

    if (req.method === "POST" && url === "/v1/proxy") {
      const pairHeader = req.headers["x-iconostasis-pair"];
      if (!pairToken || pairHeader !== pairToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unpaired or bad token" }));
        return;
      }

      const raw = await readBody(req);
      let payload: {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string | null;
      };
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      if (!payload.url || typeof payload.url !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "url required" }));
        return;
      }

      try {
        const upstream = await fetch(payload.url, {
          method: payload.method ?? "POST",
          headers: payload.headers,
          body:
            payload.method === "GET" || payload.method === "HEAD"
              ? undefined
              : (payload.body ?? undefined),
        });

        const contentType = upstream.headers.get("content-type") ?? "";
        const binary =
          contentType.includes("audio/") ||
          contentType.includes("image/") ||
          contentType.includes("octet-stream");

        const outHeaders: Record<string, string> = {};
        upstream.headers.forEach((v, k) => {
          outHeaders[k] = v;
        });

        if (binary) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: upstream.status,
              ok: upstream.ok,
              headers: outHeaders,
              bodyText: "",
              bodyBase64: buf.toString("base64"),
              binary: true,
            }),
          );
        } else {
          const text = await upstream.text();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: upstream.status,
              ok: upstream.ok,
              headers: outHeaders,
              bodyText: text,
              binary: false,
            }),
          );
        }
      } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return;
    }

    if (await handleMockRequest(req, res, () => readBody(req))) return;

    res.writeHead(404);
    res.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://${host}:${addr.port}`,
        port: addr.port,
        getPairToken: () => pairToken,
        setPairToken: (t) => {
          pairToken = t;
        },
        close: () =>
          new Promise((resClose, rej) => {
            server.close((e) => (e ? rej(e) : resClose()));
          }),
      });
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
