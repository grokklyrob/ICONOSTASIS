#!/usr/bin/env node
/**
 * iconostasis-helper — localhost paired proxy (§9.5).
 * Usage: node packages/helper/src/cli.mjs [--port 47821]
 */

import { createServer } from "node:http";

import { handleMockRequest, MOCK_BASE_PATH } from "./mockGen.mjs";

const portArg = process.argv.indexOf("--port");
const port =
  portArg >= 0 && process.argv[portArg + 1]
    ? Number(process.argv[portArg + 1])
    : 47821;

/** @type {string | null} */
let pairToken = null;

const server = createServer(async (req, res) => {
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
  const readBody = () =>
    new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });

  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, paired: Boolean(pairToken) }));
    return;
  }

  if (req.method === "POST" && url === "/pair") {
    const body = await readBody();
    try {
      const j = JSON.parse(body);
      if (!j.token || String(j.token).length < 8) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "token required" }));
        return;
      }
      pairToken = String(j.token);
      console.log("[helper] paired");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, paired: true }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "bad json" }));
    }
    return;
  }

  if (req.method === "POST" && url === "/v1/proxy") {
    if (!pairToken || req.headers["x-iconostasis-pair"] !== pairToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unpaired" }));
      return;
    }
    const raw = await readBody();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "bad json" }));
      return;
    }
    try {
      const upstream = await fetch(payload.url, {
        method: payload.method ?? "POST",
        headers: payload.headers,
        body:
          payload.method === "GET" || payload.method === "HEAD"
            ? undefined
            : payload.body ?? undefined,
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      const binary =
        contentType.includes("audio/") ||
        contentType.includes("image/") ||
        contentType.includes("octet-stream");
      /** @type {Record<string, string>} */
      const headers = {};
      upstream.headers.forEach((v, k) => {
        headers[k] = v;
      });
      if (binary) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: upstream.status,
            ok: upstream.ok,
            headers,
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
            headers,
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

  if (await handleMockRequest(req, res, readBody)) return;

  res.writeHead(404);
  res.end("iconostasis-helper");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[helper] listening http://127.0.0.1:${port}`);
  console.log("[helper] pair via POST /pair {\"token\":\"...\"}");
  console.log(
    `[helper] mock GEN baseUrl http://127.0.0.1:${port}${MOCK_BASE_PATH}`,
  );
});
