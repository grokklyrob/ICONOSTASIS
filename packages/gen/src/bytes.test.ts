import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { base64ToArrayBuffer, utf8ToArrayBuffer } from "./bytes.js";

const srcDir = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Drop block and line comments so prose mentioning the API is not a hit. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("base64ToArrayBuffer", () => {
  it("decodes base64 to the original bytes", () => {
    // "PNG\r\n" style binary, including a high byte and a NUL.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d]);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(new Uint8Array(base64ToArrayBuffer(b64))).toEqual(bytes);
  });

  it("accepts URL-safe base64", () => {
    const bytes = new Uint8Array([0xfb, 0xef, 0xbe]);
    const urlSafe = Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(new Uint8Array(base64ToArrayBuffer(urlSafe))).toEqual(bytes);
  });

  it("returns a plain ArrayBuffer sized to the payload", () => {
    const buf = base64ToArrayBuffer(Buffer.from("lumen").toString("base64"));
    expect(buf).toBeInstanceOf(ArrayBuffer);
    // Must not be a view into a larger pooled buffer (Buffer.from does this).
    expect(buf.byteLength).toBe(5);
  });

  it("round-trips utf8 text including multi-byte chars", () => {
    const buf = utf8ToArrayBuffer("antiphon — ✝");
    expect(new TextDecoder().decode(buf)).toBe("antiphon — ✝");
  });
});

describe("browser safety (packages/gen ships to the browser)", () => {
  it("uses no Node-only Buffer in non-test sources", () => {
    // vite aliases @iconostasis/gen to source, so Buffer here throws
    // ReferenceError in the browser while passing under Vitest's Node runtime.
    const offenders = sourceFiles(srcDir).filter((f) =>
      /\bBuffer\s*\./.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(offenders.map((f) => path.relative(srcDir, f))).toEqual([]);
  });
});
