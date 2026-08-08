/**
 * seraph.bin parser (§8.3).
 *
 * Layout (reverse-engineered from shipped assets/seraph.bin):
 *   uint32 LE pointCount
 *   float32[pointCount * 3] positions (xyz)
 *   uint8[pointCount * 3]   colors    (rgb, optional)
 */

export interface SeraphBinData {
  count: number;
  /** Interleaved xyz, length count * 3. */
  positions: Float32Array;
  /** Interleaved rgb 0–255, length count * 3, when present. */
  colors?: Uint8Array;
}

export class SeraphBinParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeraphBinParseError";
  }
}

/**
 * Parse a packed point-cloud .bin buffer.
 * Supports positions-only and positions+colors.
 */
export function parseSeraphBin(buffer: ArrayBuffer): SeraphBinData {
  if (buffer.byteLength < 4) {
    throw new SeraphBinParseError(
      `seraph.bin too short: ${buffer.byteLength} bytes (need header)`,
    );
  }

  const view = new DataView(buffer);
  const count = view.getUint32(0, true);
  if (count === 0) {
    return { count: 0, positions: new Float32Array(0) };
  }
  if (count > 50_000_000) {
    throw new SeraphBinParseError(`seraph.bin pointCount implausible: ${count}`);
  }

  const header = 4;
  const posBytes = count * 3 * 4;
  const colorBytes = count * 3;
  const needPos = header + posBytes;

  if (buffer.byteLength < needPos) {
    throw new SeraphBinParseError(
      `seraph.bin truncated: need ${needPos} bytes for positions, got ${buffer.byteLength}`,
    );
  }

  // Copy positions into an aligned Float32Array (source may not be 4-byte aligned after header).
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    positions[i] = view.getFloat32(header + i * 4, true);
  }

  const remaining = buffer.byteLength - needPos;
  if (remaining === 0) {
    return { count, positions };
  }
  if (remaining < colorBytes) {
    throw new SeraphBinParseError(
      `seraph.bin truncated colors: need ${colorBytes} color bytes, got ${remaining}`,
    );
  }
  if (remaining > colorBytes) {
    // Extra trailing bytes are ignored (forward tolerance).
  }

  const colors = new Uint8Array(count * 3);
  colors.set(new Uint8Array(buffer, needPos, colorBytes));
  return { count, positions, colors };
}

/** Build a tiny in-memory bin for tests. */
export function encodeSeraphBin(data: SeraphBinData): ArrayBuffer {
  const { count, positions, colors } = data;
  const posBytes = count * 3 * 4;
  const colorBytes = colors ? count * 3 : 0;
  const buffer = new ArrayBuffer(4 + posBytes + colorBytes);
  const view = new DataView(buffer);
  view.setUint32(0, count, true);
  for (let i = 0; i < count * 3; i++) {
    view.setFloat32(4 + i * 4, positions[i] ?? 0, true);
  }
  if (colors) {
    new Uint8Array(buffer, 4 + posBytes, colorBytes).set(
      colors.subarray(0, colorBytes),
    );
  }
  return buffer;
}
