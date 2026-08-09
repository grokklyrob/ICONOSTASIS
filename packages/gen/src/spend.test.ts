import { describe, expect, it } from "vitest";
import { SpendCeiling } from "./spend.js";

describe("SpendCeiling §9.4", () => {
  it("hard-stops when ceiling reached", () => {
    const s = new SpendCeiling("tokens", 10);
    expect(s.canInvoke()).toBe(true);
    s.record({ totalTokens: 10 });
    expect(s.canInvoke()).toBe(false);
    const stop = s.hardStopResult("p1");
    expect(stop.status).toBe("error");
    expect(stop.controlBlocked).toBe(true);
    expect(stop.providerId).toBe("p1");
  });

  it("raiseCeiling is explicit and only increases", () => {
    const s = new SpendCeiling("requests", 2);
    s.record();
    s.record();
    expect(s.canInvoke()).toBe(false);
    s.raiseCeiling(5);
    expect(s.canInvoke()).toBe(true);
    expect(() => s.raiseCeiling(1)).toThrow(/≥ current/);
  });

  it("request unit counts at least one per record", () => {
    const s = new SpendCeiling("requests", 3);
    s.record({});
    s.record({ requests: 2 });
    expect(s.snapshot().used).toBe(3);
    expect(s.snapshot().hardStopped).toBe(true);
  });
});
