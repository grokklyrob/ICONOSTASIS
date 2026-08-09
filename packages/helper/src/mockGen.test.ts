import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { mockImagePng, mockSpeechWav } from "./mockGen.mjs";
import { createHelperServer, MOCK_BASE_PATH } from "./server.js";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walk the chunk list, verifying every CRC — a bad CRC makes browsers reject. */
function pngChunks(png: Buffer): { type: string; data: Buffer }[] {
  const out: { type: string; data: Buffer }[] = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.subarray(off + 4, off + 8).toString("ascii");
    const data = png.subarray(off + 8, off + 8 + len);
    const declared = png.readUInt32BE(off + 8 + len);
    // Recompute over type+data the way the PNG spec requires.
    let c = 0xffffffff;
    const body = png.subarray(off + 4, off + 8 + len);
    for (const b of body) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    expect(((c ^ 0xffffffff) >>> 0), `CRC for ${type}`).toBe(declared);
    out.push({ type, data: Buffer.from(data) });
    off += 12 + len;
  }
  return out;
}

describe("mockImagePng", () => {
  it("emits a structurally valid 256x256 truecolor PNG", () => {
    const png = mockImagePng("a vesper antiphon");
    expect(png.subarray(0, 8)).toEqual(PNG_SIG);

    const chunks = pngChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);

    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBe(256); // width
    expect(ihdr.readUInt32BE(4)).toBe(256); // height
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(2); // truecolor RGB
    expect(ihdr[12]).toBe(0); // not interlaced
  });

  it("IDAT inflates to exactly one filter byte + RGB stride per row", () => {
    const png = mockImagePng("lux", 64);
    const idat = pngChunks(png).find((c) => c.type === "IDAT")!;
    const raw = inflateSync(idat.data);
    expect(raw.length).toBe((64 * 3 + 1) * 64);
    // Every scanline must declare filter type 0.
    for (let y = 0; y < 64; y += 1) {
      expect(raw[y * (64 * 3 + 1)]).toBe(0);
    }
  });

  it("is deterministic per prompt and differs across prompts", () => {
    expect(mockImagePng("alpha")).toEqual(mockImagePng("alpha"));
    expect(mockImagePng("alpha").equals(mockImagePng("omega"))).toBe(false);
  });

  it("renders actual structure, not a flat field", () => {
    const png = mockImagePng("nimbus", 64);
    const raw = inflateSync(pngChunks(png).find((c) => c.type === "IDAT")!.data);
    const lums = new Set<number>();
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        lums.add(raw[y * (64 * 3 + 1) + 1 + x * 3]!);
      }
    }
    // A gradient nimbus should span many distinct levels.
    expect(lums.size).toBeGreaterThan(24);
  });
});

describe("mockSpeechWav", () => {
  it("emits a 16-bit mono PCM WAV with a consistent header", () => {
    const wav = mockSpeechWav("one two three");
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16); // bits

    const dataBytes = wav.readUInt32LE(40);
    expect(dataBytes).toBe(wav.length - 44);
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.readUInt32LE(28)).toBe(22050 * 2); // byte rate
    expect(wav.readUInt16LE(32)).toBe(2); // block align
  });

  it("scales duration with word count", () => {
    const short = mockSpeechWav("one");
    const long = mockSpeechWav("one two three four five six seven eight");
    expect(long.length).toBeGreaterThan(short.length * 2);
  });

  it("starts and ends near silence so there is no click", () => {
    const wav = mockSpeechWav("kyrie eleison");
    expect(Math.abs(wav.readInt16LE(44))).toBeLessThan(64);
    expect(Math.abs(wav.readInt16LE(wav.length - 2))).toBeLessThan(64);
  });

  it("is audible in between", () => {
    const wav = mockSpeechWav("kyrie eleison");
    let peak = 0;
    for (let i = 44; i < wav.length - 1; i += 2) {
      peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    }
    expect(peak).toBeGreaterThan(2000);
  });
});

describe("helper mock routes", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) {
      const c = closers.pop();
      if (c) await c();
    }
  });

  it("serves openai-compat image shape with CORS, unpaired", async () => {
    const s = await createHelperServer();
    closers.push(() => s.close());

    const res = await fetch(`${s.baseUrl}${MOCK_BASE_PATH}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ prompt: "a gold nimbus", response_format: "b64_json" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    const body = (await res.json()) as { data: { b64_json: string }[] };
    const png = Buffer.from(body.data[0]!.b64_json, "base64");
    expect(png.subarray(0, 8)).toEqual(PNG_SIG);
  });

  it("serves audio/wav bytes for speech", async () => {
    const s = await createHelperServer();
    closers.push(() => s.close());

    const res = await fetch(`${s.baseUrl}${MOCK_BASE_PATH}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", input: "kyrie eleison", voice: "alloy" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    const wav = Buffer.from(await res.arrayBuffer());
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  });

  it("answers preflight", async () => {
    const s = await createHelperServer();
    closers.push(() => s.close());
    const res = await fetch(`${s.baseUrl}${MOCK_BASE_PATH}/audio/speech`, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("404s an unknown mock route without falling through to the proxy", async () => {
    const s = await createHelperServer();
    closers.push(() => s.close());
    const res = await fetch(`${s.baseUrl}${MOCK_BASE_PATH}/video/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});
