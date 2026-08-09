/**
 * Prompt-seeded PNG for the mock image route.
 *
 * A real PNG, not a placeholder: the browser must be able to decode it via
 * createImageBitmap and upload it as a backdrop texture.
 */

import { deflateSync } from "node:zlib";

import { hashString } from "./mockHash.mjs";

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
