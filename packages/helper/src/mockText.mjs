/**
 * Mock antiphon lines for the demo chat route.
 *
 * This is a **stand-in, not the §18 text path**. §18 requires the line to come
 * from a real provider on the user's own key (AMD-30: a cloud BYOK provider,
 * OpenRouter as reference). It exists so the graph is drivable with no key and
 * no spend — which is what keeps development and CI free.
 */

import { hashString } from "./mockHash.mjs";

const LINE_BANKS = [
  ["Light", "Gold", "The lamp", "Ash", "A voice", "Dust"],
  ["gathers", "kindles", "descends", "remembers", "answers", "waits"],
  [
    "in the nave",
    "on the water",
    "at the gate",
    "beneath the vault",
    "in the crypt",
    "along the rood",
  ],
  [
    "and does not fail.",
    "before the dark.",
    "and the dark yields.",
    "unhurried.",
    "till morning.",
    "as it was told.",
  ],
];

/**
 * @param {string} prompt
 * @returns {string}
 */
export function mockAntiphonLine(prompt) {
  const seed = hashString(prompt);
  return LINE_BANKS.map((bank, i) => {
    // A distinct byte of the hash per bank, so nearby prompts diverge.
    const idx = (seed >>> (i * 5)) % bank.length;
    return bank[idx];
  }).join(" ");
}
