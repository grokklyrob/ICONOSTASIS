/**
 * Host-injected per-frame snapshots for SRC ops (§11.1–§11.2).
 * Kept in types/ so operators and CookContext share them without cycles.
 */

export interface InputFrameSnapshot {
  pointerX: number;
  pointerY: number;
  pointerVx: number;
  pointerVy: number;
  pointerDown: boolean;
  keysDown?: readonly string[];
  keysEdge?: readonly string[];
  hitTag?: string;
}

export const EMPTY_INPUT_FRAME: InputFrameSnapshot = {
  pointerX: 0.5,
  pointerY: 0.5,
  pointerVx: 0,
  pointerVy: 0,
  pointerDown: false,
};

export interface MidiFrameSnapshot {
  cc?: Readonly<Record<number, number>>;
  notes?: Readonly<Record<number, number>>;
  noteOn?: readonly number[];
  noteOff?: readonly number[];
}

export const EMPTY_MIDI_FRAME: MidiFrameSnapshot = {};
