import { describe, expect, it } from "vitest";
import {
  GpuFadeQueue,
  maxConcurrentGpuFades,
} from "./gpuFadeQueue.js";

describe("maxConcurrentGpuFades", () => {
  it("matches §7.1 tier caps", () => {
    expect(maxConcurrentGpuFades("wayside")).toBe(1);
    expect(maxConcurrentGpuFades("chapel")).toBe(2);
    expect(maxConcurrentGpuFades("cathedral")).toBe(2);
  });
});

describe("GpuFadeQueue", () => {
  it("starts fades under the cap", () => {
    const q = new GpuFadeQueue(2);
    expect(q.requestFade("a", "t1")).toBe("started");
    expect(q.requestFade("b", "t1")).toBe("started");
    expect(q.activeCount).toBe(2);
  });

  it("queues overflow FIFO and promotes on complete", () => {
    const q = new GpuFadeQueue(1);
    expect(q.requestFade("a", "t1")).toBe("started");
    expect(q.requestFade("b", "t1")).toBe("queued");
    expect(q.requestFade("c", "t1")).toBe("queued");
    expect(q.queuedCount).toBe(2);

    const promoted = q.completeFade("a");
    expect(promoted).toEqual({ opId: "b", token: "t1" });
    expect(q.getActiveToken("b")).toBe("t1");
    expect(q.queuedCount).toBe(1);

    const promoted2 = q.completeFade("b");
    expect(promoted2).toEqual({ opId: "c", token: "t1" });
  });

  it("replaces older queued arrival for the same op", () => {
    const q = new GpuFadeQueue(1);
    q.requestFade("a", "t1");
    expect(q.requestFade("b", "old")).toBe("queued");
    expect(q.requestFade("b", "new")).toBe("queued");
    expect(q.queuedCount).toBe(1);
    const promoted = q.completeFade("a");
    expect(promoted).toEqual({ opId: "b", token: "new" });
  });

  it("forbids snap-to-clear-queue", () => {
    const q = new GpuFadeQueue(1);
    q.requestFade("a", "t1");
    q.requestFade("b", "t1");
    expect(() => q.snapClearQueueForbidden()).toThrow(/forbidden/);
    expect(q.queuedCount).toBe(1);
  });
});
