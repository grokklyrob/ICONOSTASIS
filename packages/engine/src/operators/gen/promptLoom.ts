/**
 * GEN/PromptLoom — template with {{slots}} from wired text/signal inputs (§9.4).
 * Synchronous; no provider call. Load-bearing signal→prompt op.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asString } from "../shared/paramUtils.js";

export const GEN_PROMPT_LOOM_TYPE = "GEN/PromptLoom" as const;

const SLOT_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Format a wired slot value for prompt text. */
export function formatSlotValue(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Compact but readable for live signals
    if (Number.isInteger(raw)) return String(raw);
    return raw.toFixed(3).replace(/\.?0+$/, "");
  }
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.map((v) => formatSlotValue(v)).join(", ");
  }
  return String(raw);
}

/**
 * Fill `{{slot}}` from getInput(slot). Unknown slots stay as empty string.
 */
export function fillPromptTemplate(
  template: string,
  getSlot: (name: string) => unknown,
): string {
  return template.replace(SLOT_RE, (_m, name: string) =>
    formatSlotValue(getSlot(name)),
  );
}

export function listTemplateSlots(template: string): string[] {
  const names = new Set<string>();
  const re = new RegExp(SLOT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m[1]) names.add(m[1]);
  }
  return [...names];
}

export const promptLoomFactory: OperatorFactory = {
  type: GEN_PROMPT_LOOM_TYPE,
  family: "GEN",
  inputs: [
    // Named slots are read dynamically by template; common convenience ports:
    { id: "lux", type: "signal", label: "slot lux" },
    { id: "band", type: "signal", label: "slot band" },
    { id: "text", type: "text", label: "slot text" },
    { id: "a", type: "signal", label: "slot a" },
    { id: "b", type: "signal", label: "slot b" },
  ],
  outputs: [{ id: "text", type: "text" }],
  params: [
    {
      id: "template",
      type: "text",
      default:
        "Ambient light is {{lux}}. Write a one-line vesper antiphon.",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let out = "";
    const instance: OperatorInstance = {
      id,
      type: GEN_PROMPT_LOOM_TYPE,
      family: "GEN",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "text") return out;
        throw new Error(`GEN/PromptLoom: unknown port "${port}"`);
      },
      cook(ctx) {
        const template = asString(ctx.getParam("template") as ParamValue, "");
        out = fillPromptTemplate(template, (name) => ctx.getInput(name));
        ctx.setOutput("text", out);
      },
      dispose() {
        /* no-op */
      },
      serialize() {
        return { ...this.params };
      },
    };
    return instance;
  },
};
