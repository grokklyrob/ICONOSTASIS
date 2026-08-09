import { describe, expect, it } from "vitest";
import { OperatorRegistry } from "../registry/registry.js";
import {
  GEN_ANTIPHON_TYPE,
  GEN_ICON_TYPE,
  GEN_ORACLE_TYPE,
  GEN_PROMPT_LOOM_TYPE,
  registerM2Operators,
} from "./catalog.js";

describe("M2 catalog", () => {
  it("registers four GEN ops on top of M1", () => {
    const reg = new OperatorRegistry();
    registerM2Operators(reg);
    for (const t of [
      GEN_PROMPT_LOOM_TYPE,
      GEN_ORACLE_TYPE,
      GEN_ICON_TYPE,
      GEN_ANTIPHON_TYPE,
    ]) {
      expect(reg.get(t).family).toBe("GEN");
    }
  });
});
