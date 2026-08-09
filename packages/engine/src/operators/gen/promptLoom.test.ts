import { describe, expect, it } from "vitest";
import {
  fillPromptTemplate,
  formatSlotValue,
  listTemplateSlots,
  promptLoomFactory,
} from "./promptLoom.js";

describe("GEN/PromptLoom", () => {
  it("lists and fills slots", () => {
    const t = "light {{lux}} band {{band}} note {{text}}";
    expect(listTemplateSlots(t)).toEqual(["lux", "band", "text"]);
    expect(
      fillPromptTemplate(t, (n) => {
        if (n === "lux") return 0.42;
        if (n === "band") return 1;
        if (n === "text") return "vesper";
        return undefined;
      }),
    ).toBe("light 0.42 band 1 note vesper");
  });

  it("formats numbers compactly", () => {
    expect(formatSlotValue(3)).toBe("3");
    expect(formatSlotValue(1.5)).toBe("1.5");
  });

  it("cooks template from inputs", () => {
    const op = promptLoomFactory.create("pl", {
      template: "Ambient {{lux}}",
    });
    const out = new Map<string, unknown>();
    op.cook({
      time: 0,
      delta: 0.016,
      frame: 0,
      getInput: (p) => (p === "lux" ? 0.75 : undefined),
      getParam: (id) => op.params[id]!,
      getBaseParam: (id) => op.params[id],
      setOutput: (port, v) => out.set(port, v),
    });
    expect(out.get("text")).toBe("Ambient 0.75");
    expect(op.getOutput("text")).toBe("Ambient 0.75");
  });
});
