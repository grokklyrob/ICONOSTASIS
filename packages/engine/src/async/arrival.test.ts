import { describe, expect, it } from "vitest";
import {
  advanceSignalCrossfade,
  beginHoldSwap,
  beginSignalCrossfade,
  commitHoldSwap,
  crossfadeSignal,
  onAudioCueBoundary,
  onAudioFresh,
  textStreamAppend,
  type AudioArrivalState,
  type HoldSwapState,
} from "./arrival.js";
import { asyncCacheKey, parseCacheScope } from "./cacheScope.js";

describe("cacheScope", () => {
  it("defaults unknown to station", () => {
    expect(parseCacheScope("station")).toBe("station");
    expect(parseCacheScope("global")).toBe("global");
    expect(parseCacheScope("nope")).toBe("station");
  });

  it("builds station vs global keys (§7.1)", () => {
    expect(asyncCacheKey("op1", "station", "stA", "gen:1")).toBe(
      "op1|station:stA|gen:1",
    );
    expect(asyncCacheKey("op1", "global", "stA", "gen:1")).toBe(
      "op1|global|gen:1",
    );
    expect(asyncCacheKey("op1", "station", undefined)).toBe(
      "op1|station:default",
    );
  });
});

describe("signal crossfade", () => {
  it("lerps and clamps t", () => {
    expect(crossfadeSignal(0, 10, 0)).toBe(0);
    expect(crossfadeSignal(0, 10, 0.5)).toBe(5);
    expect(crossfadeSignal(0, 10, 1)).toBe(10);
    expect(crossfadeSignal(0, 10, 2)).toBe(10);
    expect(crossfadeSignal(0, 10, -1)).toBe(0);
  });

  it("advances presentation fading → current", () => {
    let state = beginSignalCrossfade(0, 100, 1000);
    expect(state.presentation).toBe("fading");
    const mid = advanceSignalCrossfade(state, 500);
    expect(mid.value).toBe(50);
    expect(mid.state.presentation).toBe("fading");
    state = mid.state;
    const end = advanceSignalCrossfade(state, 500);
    expect(end.value).toBe(100);
    expect(end.state.presentation).toBe("current");
  });
});

describe("text arrival", () => {
  it("streaming is append-only", () => {
    expect(textStreamAppend("In ", "principio")).toBe("In principio");
    expect(textStreamAppend("", "lux")).toBe("lux");
  });

  it("replacement holds then atomic swaps", () => {
    let state: HoldSwapState<string> = {
      presented: "old",
      pending: undefined,
      status: "idle",
      presentation: "current",
    };
    state = beginHoldSwap(state, "new");
    expect(state.presented).toBe("old");
    expect(state.pending).toBe("new");
    expect(state.presentation).toBe("queued");
    expect(state.status).toBe("fresh");
    state = commitHoldSwap(state);
    expect(state.presented).toBe("new");
    expect(state.pending).toBeUndefined();
    expect(state.presentation).toBe("current");
  });

  it("first text value fills empty cache immediately", () => {
    const empty: HoldSwapState<string> = {
      presented: undefined,
      pending: undefined,
      status: "idle",
      presentation: "current",
    };
    const next = beginHoldSwap(empty, "first");
    expect(next.presented).toBe("first");
    expect(next.presentation).toBe("current");
  });
});

describe("audio arrival", () => {
  it("idle path presents immediately", () => {
    const idle: AudioArrivalState = {
      playing: undefined,
      queued: undefined,
      status: "idle",
      presentation: "current",
    };
    const next = onAudioFresh(idle, "buf-a", false);
    expect(next.playing).toBe("buf-a");
    expect(next.queued).toBeUndefined();
    expect(next.presentation).toBe("current");
  });

  it("never replaces mid-playback; queues and promotes on cue", () => {
    let state: AudioArrivalState = {
      playing: "buf-a",
      queued: undefined,
      status: "fresh",
      presentation: "current",
    };
    state = onAudioFresh(state, "buf-b", true);
    expect(state.playing).toBe("buf-a");
    expect(state.queued).toBe("buf-b");
    expect(state.presentation).toBe("queued");
    // Newer replaces older queued for same op.
    state = onAudioFresh(state, "buf-c", true);
    expect(state.queued).toBe("buf-c");
    state = onAudioCueBoundary(state);
    expect(state.playing).toBe("buf-c");
    expect(state.queued).toBeUndefined();
    expect(state.presentation).toBe("current");
  });
});
