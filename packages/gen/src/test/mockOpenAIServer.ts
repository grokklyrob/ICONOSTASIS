/**
 * In-process OpenAI-compatible mock (chat/completions JSON + SSE).
 * Proves the live adapter path over real TCP without requiring Ollama.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface MockOpenAIServer {
  baseUrl: string;
  /** Authorization headers observed (for auth injection assertions). */
  authHeaders: string[];
  close(): Promise<void>;
}

export async function startMockOpenAIServer(opts?: {
  replyText?: string;
  requireAuth?: boolean;
  expectedBearer?: string;
}): Promise<MockOpenAIServer> {
  const replyText = opts?.replyText ?? "lumen";
  const authHeaders: string[] = [];

  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization;
    if (typeof auth === "string") authHeaders.push(auth);

    if (opts?.requireAuth) {
      const expected = `Bearer ${opts.expectedBearer ?? "test-key"}`;
      if (auth !== expected) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "unauthorized" } }));
        return;
      }
    }

    if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        let body: { stream?: boolean; model?: string } = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            stream?: boolean;
            model?: string;
          };
        } catch {
          /* ignore */
        }

        if (body.stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          // Split reply into two SSE deltas
          const mid = Math.max(1, Math.floor(replyText.length / 2));
          const a = replyText.slice(0, mid);
          const b = replyText.slice(mid);
          res.write(
            `data: ${JSON.stringify({
              model: body.model ?? "mock",
              choices: [{ delta: { content: a } }],
            })}\n\n`,
          );
          res.write(
            `data: ${JSON.stringify({
              model: body.model ?? "mock",
              choices: [{ delta: { content: b }, finish_reason: "stop" }],
            })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            model: body.model ?? "mock",
            choices: [
              { message: { role: "assistant", content: replyText } },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 2,
              total_tokens: 10,
            },
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}/v1`;

  return {
    baseUrl,
    authHeaders,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
