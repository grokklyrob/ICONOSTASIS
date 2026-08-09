/**
 * Shared seed for the mock generators.
 *
 * Every mock output is derived from its prompt through this, so a changed
 * prompt visibly changes the image, audibly changes the voice, and rewrites the
 * line — which is what makes the demo legible as *live* rather than static.
 */

/**
 * FNV-1a. Deterministic per prompt so a fire is reproducible.
 * @param {string} s
 * @returns {number}
 */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
