/**
 * LIT/Caption — illuminated text surface (Appendix A, AMD-02).
 * References story caption id; presents text for DOM aria-live / viewport.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asBool, asString } from "../shared/paramUtils.js";

export const LIT_CAPTION_TYPE = "LIT/Caption" as const;

export interface CaptionState {
  kind: "caption";
  captionId: string;
  text: string;
  visible: boolean;
}

export const captionFactory: OperatorFactory = {
  type: LIT_CAPTION_TYPE,
  family: "LIT",
  inputs: [
    { id: "text", type: "text", label: "override / stream" },
  ],
  outputs: [
    { id: "text", type: "text" },
    { id: "story", type: "story" },
  ],
  params: [
    {
      id: "captionId",
      type: "string",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "text",
      type: "text",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "visible",
      type: "bool",
      default: true,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let state: CaptionState = {
      kind: "caption",
      captionId: "",
      text: "",
      visible: true,
    };
    const instance: OperatorInstance = {
      id,
      type: LIT_CAPTION_TYPE,
      family: "LIT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "text") return state.text;
        if (port === "story") return state;
        throw new Error(`LIT/Caption: unknown port "${port}"`);
      },
      cook(ctx) {
        const wired = ctx.getInput("text");
        const text =
          typeof wired === "string"
            ? wired
            : asString(ctx.getParam("text"), "");
        state = {
          kind: "caption",
          captionId: asString(ctx.getParam("captionId"), ""),
          text,
          visible: asBool(ctx.getParam("visible"), true),
        };
        ctx.setOutput("text", state.text);
        ctx.setOutput("story", state);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
