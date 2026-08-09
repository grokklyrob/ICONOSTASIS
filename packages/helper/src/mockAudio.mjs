/**
 * Prompt-seeded WAV for the mock speech route.
 *
 * Not speech — but real 16-bit mono PCM of a realistic length, so Antiphon's
 * queue-to-cue timing behaves as it would against a real TTS response.
 */

import { hashString } from "./mockHash.mjs";

/**
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
