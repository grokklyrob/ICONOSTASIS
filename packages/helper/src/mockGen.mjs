/**
 * Mock image + speech generators for the M2 demo (§18 "or mock in UI").
 *
 * Serves the openai-compat shapes the real endpoints use, so GEN/Icon and
 * GEN/Antiphon exercise the whole path — descriptor → fetch boundary → adapter
 * parse → gen-field / audio queue-to-cue — with no API key and no spend.
 *
 * Output is real PNG and real WAV (not placeholders): the browser must be able
 * to decode these via createImageBitmap and AudioContext.decodeAudioData.
 * Both are derived deterministically from the prompt, so a changed prompt
 * visibly changes the texture and audibly changes the voice — which is what
 * makes the demo legible as *live* rather than a static stand-in.
 *
 * Plain .mjs on purpose: `pnpm helper` runs `cli.mjs` through bare node with no
 * build step, while the tests exercise `server.ts`. Both import this file, so
 * the routes you run are the routes that are tested.
 */

import { deflateSync } from "node:zlib";

/** Mock GEN endpoints. Point a provider's baseUrl at `<helper>/v1/mock`. */
export const MOCK_BASE_PATH = "/v1/mock";

/**
 * FNV-1a. Deterministic per prompt so a fire is reproducible.
 * @param {string} s
 * @returns {number}
 */
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * @param {Uint8Array} buf
 * @returns {number}
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Uint8Array} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * Encode raw RGB scanlines as a PNG (color type 2, 8-bit, no interlace).
 * Filter byte 0 per row — zlib does the compressing.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgb
 * @returns {Buffer}
 */
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * A prompt-seeded icon: banded radial nimbus in liturgical gold/indigo.
 * Deliberately not noise — the demo needs something a viewer reads as an image.
 * @param {string} prompt
 * @param {number} [size]
 * @returns {Buffer}
 */
export function mockImagePng(prompt, size = 256) {
  const seed = hashString(prompt);
  const hueShift = (seed % 360) / 360;
  const bands = 3 + (seed % 5);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = Math.SQRT2 * (size / 2);

  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      // Concentric bands, rayed by angle, falling off to a dark ground.
      const band =
        0.5 + 0.5 * Math.cos(r * bands * Math.PI * 2 - hueShift * 6.283);
      const rays = 0.5 + 0.5 * Math.cos(theta * bands + hueShift * 6.283);
      const falloff = Math.max(0, 1 - r * 1.15);
      const v = Math.pow(falloff, 1.6) * (0.55 * band + 0.45 * rays);

      // Gold core → indigo rim.
      const i = (y * size + x) * 3;
      rgb[i] = Math.min(255, Math.round(255 * v * (0.95 + 0.25 * hueShift)));
      rgb[i + 1] = Math.min(255, Math.round(255 * v * (0.72 + 0.2 * band)));
      rgb[i + 2] = Math.min(
        255,
        Math.round(255 * (v * 0.35 + 0.09 + 0.16 * (1 - falloff) * rays)),
      );
    }
  }
  return encodePng(size, size, rgb);
}

/**
 * A prompt-seeded utterance: 16-bit mono PCM WAV, one syllable-ish blip per
 * word over a drone. Not speech — but real audio of a realistic length, so
 * Antiphon's queue-to-cue timing behaves as it would with a real TTS response.
 * @param {string} text
 * @param {number} [sampleRate]
 * @returns {Buffer}
 */
export function mockSpeechWav(text, sampleRate = 22050) {
  const seed = hashString(text);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const seconds = Math.min(8, 0.35 + wordCount * 0.28);
  const frames = Math.floor(seconds * sampleRate);

  const base = 110 + (seed % 60); // A2-ish, varies per prompt
  const samples = new Int16Array(frames);

  for (let n = 0; n < frames; n += 1) {
    const t = n / sampleRate;
    const p = t / seconds;

    // Which word are we in, and how far through it.
    const wf = p * wordCount;
    const wi = Math.min(wordCount - 1, Math.floor(wf));
    const wp = wf - wi;

    // Per-word pitch from that word's own hash — prosody-ish contour.
    const wSeed = hashString(words[wi] ?? "");
    const step = [0, 2, 3, 5, 7, 9][wSeed % 6] ?? 0;
    const f = base * Math.pow(2, step / 12);

    // Syllable envelope: quick attack, decay, silence between words.
    const gate = wp < 0.72 ? Math.sin((wp / 0.72) * Math.PI) : 0;
    const env = Math.pow(gate, 0.8);

    // Drone + two harmonics, slight vibrato.
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t);
    const v =
      0.5 * Math.sin(2 * Math.PI * f * vib * t) +
      0.25 * Math.sin(2 * Math.PI * f * 2 * vib * t) +
      0.12 * Math.sin(2 * Math.PI * f * 3 * vib * t) +
      0.06 * Math.sin(2 * Math.PI * (base / 2) * t);

    // Global fade to guarantee no click at either edge.
    const edge = Math.min(1, Math.min(p, 1 - p) * 40);
    samples[n] = Math.max(
      -32768,
      Math.min(32767, Math.round(v * env * edge * 0.32 * 32767)),
    );
  }

  const dataBytes = samples.length * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    out.writeInt16LE(samples[i] ?? 0, 44 + i * 2);
  }
  return out;
}

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
