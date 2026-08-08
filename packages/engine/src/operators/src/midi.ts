/**
 * SRC/MIDI — WebMIDI CC/note as signals/events (§11.2).
 * Host injects MidiFrameSnapshot; feature-detected optional at shell.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite } from "../shared/paramUtils.js";
import { EMPTY_MIDI_FRAME, type MidiFrameSnapshot } from "./midiFrame.js";

export const SRC_MIDI_TYPE = "SRC/MIDI" as const;

export const midiFactory: OperatorFactory = {
  type: SRC_MIDI_TYPE,
  family: "SRC",
  inputs: [],
  outputs: [
    { id: "cc", type: "signal" },
    { id: "note", type: "signal", label: "velocity if note held" },
    { id: "noteOn", type: "event" },
    { id: "noteOff", type: "event" },
  ],
  params: [
    {
      id: "ccNumber",
      type: "int",
      default: 1,
      min: 0,
      max: 127,
      modulatable: false,
      exposable: true,
    },
    {
      id: "noteNumber",
      type: "int",
      default: 60,
      min: 0,
      max: 127,
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    const outs = { cc: 0, note: 0, noteOn: 0, noteOff: 0 };

    const instance: OperatorInstance = {
      id,
      type: SRC_MIDI_TYPE,
      family: "SRC",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (!(port in outs)) {
          throw new Error(`SRC/MIDI: unknown port "${port}"`);
        }
        return outs[port as keyof typeof outs];
      },
      cook(ctx) {
        const frame: MidiFrameSnapshot = ctx.midi ?? EMPTY_MIDI_FRAME;
        const ccNum = Math.floor(asFinite(ctx.getParam("ccNumber"), 1));
        const noteNum = Math.floor(asFinite(ctx.getParam("noteNumber"), 60));

        outs.cc = frame.cc?.[ccNum] ?? 0;
        outs.note = frame.notes?.[noteNum] ?? 0;
        outs.noteOn = frame.noteOn?.includes(noteNum) ? 1 : 0;
        outs.noteOff = frame.noteOff?.includes(noteNum) ? 1 : 0;

        ctx.setOutput("cc", outs.cc);
        ctx.setOutput("note", outs.note);
        ctx.setOutput("noteOn", outs.noteOn);
        ctx.setOutput("noteOff", outs.noteOff);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
