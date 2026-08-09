/**
 * Mock GEN routes for the M2 demo (§18 "or mock in UI").
 *
 * Serves the openai-compat shapes the real endpoints use, so GEN/Oracle,
 * GEN/Icon and GEN/Antiphon exercise the whole path — descriptor → fetch
 * boundary → adapter parse → gen-field / audio queue-to-cue — with no API key
 * and no spend.
 *
 * The chat route exists so the graph is drivable with no key and no spend.
 * It does **not** stand in for §18's text requirement, which is a real provider
 * on the user's own key (AMD-30: cloud BYOK, OpenRouter as reference path).
 *
 * Payload generation lives in mockImage / mockAudio / mockText; this file is
 * routing only. Plain .mjs on purpose: `pnpm helper` runs `cli.mjs` through
 * bare node with no build step, while the tests exercise `server.ts`. Both
 * import this file, so the routes you run are the routes that are tested.
 */

import { mockSpeechWav } from "./mockAudio.mjs";
import { mockImagePng } from "./mockImage.mjs";
import { mockAntiphonLine } from "./mockText.mjs";

// Re-exported so existing importers (server.ts, cli.mjs, tests) keep one entry point.
export { mockSpeechWav, mockImagePng, mockAntiphonLine };

/** Mock GEN endpoints. Point a provider's baseUrl at `<helper>/v1/mock`. */
export const MOCK_BASE_PATH = "/v1/mock";

/**
 * The app runs on :5173 and the helper on :47821 — cross-origin. The real
 * /v1/proxy route exists precisely so secrets never need CORS, but the mock
 * carries no secret, so allowing localhost origins lets the demo prove the
 * *direct* route too. Bound to loopback either way.
 * @param {string | undefined} origin
 * @returns {Record<string, string>}
 */
export function mockCorsHeaders(origin) {
  const allowed =
    origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}

/**
 * Handle a `/v1/mock/**` request. Returns false if the url is not a mock route,
 * so the caller can continue its own routing.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => Promise<string>} readBody
 * @returns {Promise<boolean>}
 */
export async function handleMockRequest(req, res, readBody) {
  const url = req.url ?? "/";
  if (!url.startsWith(MOCK_BASE_PATH)) return false;

  const cors = mockCorsHeaders(req.headers.origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return true;
  }

  const route = url.slice(MOCK_BASE_PATH.length).split("?")[0];

  /** @param {number} status @param {unknown} body */
  const json = (status, body) => {
    res.writeHead(status, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  /** @returns {Promise<Record<string, unknown> | null>} */
  const parsed = async () => {
    try {
      return JSON.parse(await readBody());
    } catch {
      return null;
    }
  };

  if (req.method === "POST" && route === "/chat/completions") {
    const body = await parsed();
    if (!body) {
      json(400, { error: { message: "invalid JSON" } });
      return true;
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages]
      .reverse()
      .find((m) => m && typeof m === "object" && m.role === "user");
    const line = mockAntiphonLine(String(lastUser?.content ?? ""));
    const usage = {
      prompt_tokens: Math.ceil(String(lastUser?.content ?? "").length / 4),
      completion_tokens: Math.ceil(line.length / 4),
      total_tokens:
        Math.ceil(String(lastUser?.content ?? "").length / 4) +
        Math.ceil(line.length / 4),
    };

    if (body.stream !== true) {
      json(200, {
        id: "mock-chat",
        model: "mock-oracle-1",
        choices: [
          { index: 0, message: { role: "assistant", content: line },
            finish_reason: "stop" },
        ],
        usage,
      });
      return true;
    }

    res.writeHead(200, {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Word-at-a-time with a real gap: GEN/Oracle's replacement-not-append
    // streaming behaviour is only observable if deltas actually arrive apart.
    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });
    const words = line.split(" ");
    for (let i = 0; i < words.length; i += 1) {
      if (aborted) return true;
      const content = i === 0 ? words[i] : ` ${words[i]}`;
      res.write(
        `data: ${JSON.stringify({
          id: "mock-chat",
          model: "mock-oracle-1",
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        })}\n\n`,
      );
      await new Promise((r) => setTimeout(r, 70));
    }
    if (aborted) return true;
    res.write(
      `data: ${JSON.stringify({
        id: "mock-chat",
        model: "mock-oracle-1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage,
      })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
    return true;
  }

  if (req.method === "POST" && route === "/images/generations") {
    const body = await parsed();
    if (!body) {
      json(400, { error: { message: "invalid JSON" } });
      return true;
    }
    const png = mockImagePng(String(body.prompt ?? ""));
    json(200, {
      created: Math.floor(Date.now() / 1000),
      model: "mock-icon-1",
      data: [{ b64_json: png.toString("base64") }],
    });
    return true;
  }

  if (req.method === "POST" && route === "/audio/speech") {
    const body = await parsed();
    if (!body) {
      json(400, { error: { message: "invalid JSON" } });
      return true;
    }
    const wav = mockSpeechWav(String(body.input ?? ""));
    res.writeHead(200, {
      ...cors,
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
    });
    res.end(wav);
    return true;
  }

  json(404, { error: { message: `no mock route ${route}` } });
  return true;
}
