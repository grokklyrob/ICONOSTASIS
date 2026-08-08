/**
 * LIT/Choice — branching choice control (Appendix A, AMD-02).
 * Emits selection events; story.json remains authority for options list.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const LIT_CHOICE_TYPE = "LIT/Choice" as const;

export interface ChoiceState {
  kind: "choice";
  choiceId: string;
  selectedIndex: number;
  selectedId: string;
}

export const choiceFactory: OperatorFactory = {
  type: LIT_CHOICE_TYPE,
  family: "LIT",
  inputs: [
    { id: "select", type: "event", label: "select edge / index" },
  ],
  outputs: [
    { id: "selected", type: "signal" },
    { id: "event", type: "event" },
    { id: "story", type: "story" },
  ],
  params: [
    {
      id: "choiceId",
      type: "string",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "optionCount",
      type: "int",
      default: 2,
      min: 1,
      max: 16,
      modulatable: false,
      exposable: true,
    },
    {
      id: "selectedIndex",
      type: "int",
      default: -1,
      min: -1,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let selectedIndex = -1;
    let event = 0;
    let prevSelect = 0;

    const instance: OperatorInstance = {
      id,
      type: LIT_CHOICE_TYPE,
      family: "LIT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port === "selected") return selectedIndex;
        if (port === "event") return event;
        if (port === "story") {
          const choiceId = asString(instance.params["choiceId"], "");
          return {
            kind: "choice",
            choiceId,
            selectedIndex,
            selectedId:
              selectedIndex >= 0 ? `${choiceId}:${selectedIndex}` : "",
          } satisfies ChoiceState;
        }
        throw new Error(`LIT/Choice: unknown port "${port}"`);
      },
      cook(ctx) {
        const choiceId = asString(ctx.getParam("choiceId"), "");
        const count = Math.max(
          1,
          Math.floor(asFinite(ctx.getParam("optionCount"), 2)),
        );
        const paramIdx = Math.floor(asFinite(ctx.getParam("selectedIndex"), -1));
        const selectIn = ctx.getInput("select");
        const selectVal =
          selectIn !== undefined && selectIn !== null
            ? Number(selectIn)
            : paramIdx;

        event = 0;
        if (Number.isFinite(selectVal) && selectVal >= 0) {
          const idx = Math.min(count - 1, Math.floor(selectVal));
          // Edge: change of selection
          if (idx !== selectedIndex || (selectVal > 0 && prevSelect === 0)) {
            selectedIndex = idx;
            event = 1;
          }
        }
        prevSelect =
          selectIn !== undefined && selectIn !== null ? Number(selectIn) : 0;

        const state: ChoiceState = {
          kind: "choice",
          choiceId,
          selectedIndex,
          selectedId:
            selectedIndex >= 0 ? `${choiceId}:${selectedIndex}` : "",
        };
        ctx.setOutput("selected", selectedIndex);
        ctx.setOutput("event", event);
        ctx.setOutput("story", state);
      },
      dispose() {
        selectedIndex = -1;
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
