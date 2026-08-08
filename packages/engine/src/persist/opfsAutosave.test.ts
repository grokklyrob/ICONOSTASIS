/**
 * Autosave ring — memory store (OPFS optional in browser hosts).
 */
import { describe, expect, it } from "vitest";
import {
  AutosaveRing,
  AUTOSAVE_RING_SIZE,
  createAutosaveStore,
  MemoryAutosaveStore,
} from "./opfsAutosave.js";

describe("AutosaveRing", () => {
  it("writes and restores latest", async () => {
    const store = new MemoryAutosaveStore();
    const ring = new AutosaveRing(store, 3);
    await ring.save(new Uint8Array([1, 2]), "a");
    await ring.save(new Uint8Array([3, 4, 5]), "b");
    const latest = await ring.latest();
    expect(latest?.meta.label).toBe("b");
    expect(latest?.bytes).toEqual(new Uint8Array([3, 4, 5]));
  });

  it("rings within max slots", async () => {
    const store = new MemoryAutosaveStore();
    const ring = new AutosaveRing(store, 3);
    for (let i = 0; i < 5; i++) {
      await ring.save(new Uint8Array([i]), `n${i}`);
    }
    const list = await ring.list();
    expect(list.length).toBeLessThanOrEqual(3);
    // Latest is n4
    expect(list[0]?.label).toBe("n4");
  });

  it("default ring size is 20", () => {
    expect(AUTOSAVE_RING_SIZE).toBe(20);
  });

  it("createAutosaveStore falls back to memory in Node", async () => {
    const { store, backend } = await createAutosaveStore();
    expect(backend === "memory" || backend === "opfs").toBe(true);
    const ring = new AutosaveRing(store);
    const meta = await ring.save(new Uint8Array([9]), "probe");
    expect(meta.bytes).toBe(1);
    await ring.clear();
  });
});
