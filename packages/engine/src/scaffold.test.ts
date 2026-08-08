import { describe, expect, it } from "vitest";
import { ENGINE_PACKAGE } from "./index.js";

describe("M0 scaffold", () => {
  it("exports the engine package identity", () => {
    expect(ENGINE_PACKAGE).toBe("@iconostasis/engine");
  });
});
