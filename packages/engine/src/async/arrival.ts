/**
 * Async Arrival Law pure helpers (architecture.md §7.1).
 * Newly arrived values must not replace *presented* output on the `fresh`
 * transition except through the port-type policy below.
 */

import type { AsyncStatus, Presentation } from "../types/ports.js";

/** Default temporal window where a duration applies (§7.1). */
export const DEFAULT_ARRIVAL_WINDOW_MS = 1200;

/** Audio idle fade-in cap (§7.1 media/audio). */
export const AUDIO_IDLE_FADE_IN_MS = 80;

export function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** signal / field: must crossfade (lerp). */
export function crossfadeSignal(
  from: number,
  to: number,
  t: number,
): number {
  const u = clamp01(t);
  return from + (to - from) * u;
}

/**
 * text streaming mode: append-only growth IS the arrival policy.
 * Incremental append is not a pop (§7.1, §9.4).
 */
export function textStreamAppend(presented: string, chunk: string): string {
  return presented + chunk;
}

export interface HoldSwapState<T> {
  presented: T | undefined;
  pending: T | undefined;
  status: AsyncStatus;
  presentation: Presentation;
}

/**
 * text replacement mode (and geometry hold-then-swap):
 * hold last displayed through the window, then atomic swap — never snap
 * mid-frame over a prior result on the fresh transition alone.
 */
export function beginHoldSwap<T>(
  state: HoldSwapState<T>,
  next: T,
): HoldSwapState<T> {
  if (state.presented === undefined) {
    // Empty cache → first value may become presented immediately.
    return {
      presented: next,
      pending: undefined,
      status: "fresh",
      presentation: "current",
    };
  }
  return {
    presented: state.presented,
    pending: next,
    status: "fresh",
    presentation: "queued",
  };
}

/** Commit pending → presented (end of hold window / atomic swap). */
export function commitHoldSwap<T>(state: HoldSwapState<T>): HoldSwapState<T> {
  if (state.pending === undefined) {
    return {
      ...state,
      presentation: "current",
    };
  }
  return {
    presented: state.pending,
    pending: undefined,
    status: "fresh",
    presentation: "current",
  };
}

export interface AudioArrivalState {
  /** Currently presented / playing buffer token. */
  playing: string | undefined;
  /** Next buffer waiting for a cue boundary. */
  queued: string | undefined;
  status: AsyncStatus;
  presentation: Presentation;
}

/**
 * media (audio): never replace a playing buffer mid-playback; queue as next
 * until a cue boundary. If idle, short gain fade-in is the consumer's job;
 * status may be fresh while still queued.
 */
export function onAudioFresh(
  state: AudioArrivalState,
  nextToken: string,
  isPlaying: boolean,
): AudioArrivalState {
  if (!isPlaying || state.playing === undefined) {
    return {
      playing: nextToken,
      queued: undefined,
      status: "fresh",
      presentation: "current",
    };
  }
  // Per-op newer arrival replaces older queued arrival for that op.
  return {
    playing: state.playing,
    queued: nextToken,
    status: "fresh",
    presentation: "queued",
  };
}

/**
 * Cue boundary: promote queue → playing.
 * Boundaries: audio.ended, station exit, bound cue, or event:complete consumer.
 */
export function onAudioCueBoundary(state: AudioArrivalState): AudioArrivalState {
  if (state.queued === undefined) {
    return {
      ...state,
      playing: undefined,
      presentation: "current",
    };
  }
  return {
    playing: state.queued,
    queued: undefined,
    status: "fresh",
    presentation: "current",
  };
}

export interface CrossfadeState {
  from: number;
  to: number;
  /** Elapsed ms in the crossfade window. */
  elapsedMs: number;
  windowMs: number;
  status: AsyncStatus;
  presentation: Presentation;
}

/** Start a signal crossfade from current presented value to next. */
export function beginSignalCrossfade(
  from: number,
  to: number,
  windowMs: number = DEFAULT_ARRIVAL_WINDOW_MS,
): CrossfadeState {
  return {
    from,
    to,
    elapsedMs: 0,
    windowMs: windowMs > 0 ? windowMs : DEFAULT_ARRIVAL_WINDOW_MS,
    status: "fresh",
    presentation: "fading",
  };
}

/** Advance crossfade by deltaMs; returns presented value and updated state. */
export function advanceSignalCrossfade(
  state: CrossfadeState,
  deltaMs: number,
): { value: number; state: CrossfadeState } {
  const elapsedMs = state.elapsedMs + Math.max(0, deltaMs);
  const t = clamp01(elapsedMs / state.windowMs);
  const value = crossfadeSignal(state.from, state.to, t);
  if (t >= 1) {
    return {
      value: state.to,
      state: {
        ...state,
        elapsedMs,
        status: "fresh",
        presentation: "current",
      },
    };
  }
  return {
    value,
    state: {
      ...state,
      elapsedMs,
      status: "fresh",
      presentation: "fading",
    },
  };
}
