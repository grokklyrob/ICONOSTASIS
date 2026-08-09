import { describe, expect, it } from "vitest";
import {
  appendProvenance,
  createEmptyProvenance,
  parseProvenance,
} from "./provenance.js";

describe("provenance §12.4", () => {
  it("appends records without secrets", () => {
    let doc = createEmptyProvenance();
    doc = appendProvenance(doc, {
      artifactHash: "a".repeat(64),
      capability: "text.generate",
      providerClass: "openai-compat",
      modelId: "smollm:135m",
      promptHash: "b".repeat(64),
      promptText: "lumen",
      params: { temperature: 0.2 },
      seed: 1,
      createdAt: new Date().toISOString(),
      opId: "oracle_1",
    });
    expect(doc.records).toHaveLength(1);
    expect(parseProvenance(doc).records[0]?.providerClass).toBe(
      "openai-compat",
    );
  });
});
