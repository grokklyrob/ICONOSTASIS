import { describe, expect, it } from "vitest";
import { PointGovernor } from "./pointGovernor.js";

describe("PointGovernor", () => {
  it("grants min(requested, remaining)", () => {
    const g = new PointGovernor(100);
    expect(g.request("a", 60)).toBe(60);
    expect(g.request("b", 50)).toBe(40);
    expect(g.remaining).toBe(0);
    expect(g.request("c", 10)).toBe(0);
  });

  it("re-request replaces prior lease for the same emitter", () => {
    const g = new PointGovernor(100);
    expect(g.request("a", 80)).toBe(80);
    expect(g.request("a", 30)).toBe(30);
    expect(g.used).toBe(30);
    expect(g.remaining).toBe(70);
  });

  it("release frees budget for others", () => {
    const g = new PointGovernor(50);
    g.request("a", 50);
    g.release("a");
    expect(g.request("b", 40)).toBe(40);
  });

  it("reset clears leases and can change budget", () => {
    const g = new PointGovernor(100);
    g.request("a", 50);
    g.reset(20);
    expect(g.used).toBe(0);
    expect(g.budget).toBe(20);
    expect(g.request("a", 50)).toBe(20);
  });

  it("snapshot exposes leases", () => {
    const g = new PointGovernor(100);
    g.request("pc1", 40);
    g.request("pc2", 10);
    expect(g.snapshot()).toEqual({
      budget: 100,
      used: 50,
      remaining: 50,
      leases: { pc1: 40, pc2: 10 },
    });
  });
});
