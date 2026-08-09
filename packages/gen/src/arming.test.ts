import { describe, expect, it } from "vitest";
import { ArmingController } from "./arming.js";

describe("ArmingController §9.4", () => {
  it("defaults: edit armed, perform disarmed", () => {
    const a = new ArmingController();
    expect(a.isArmed(undefined, "edit")).toBe(true);
    expect(a.isArmed(undefined, "perform")).toBe(false);
  });

  it("perform requires global arm", () => {
    const a = new ArmingController();
    a.setMode("perform");
    expect(a.isArmed()).toBe(false);
    a.setGlobalArmed("perform", true);
    expect(a.isArmed()).toBe(true);
  });

  it("per-op override wins over global", () => {
    const a = new ArmingController();
    a.setMode("perform");
    a.setGlobalArmed("perform", true);
    a.setOpArmed("op_a", false);
    expect(a.isArmed("op_a")).toBe(false);
    expect(a.isArmed("op_b")).toBe(true);
    a.setOpArmed("op_a", null);
    expect(a.isArmed("op_a")).toBe(true);
  });

  it("disarmedResult is control-blocked error", () => {
    const a = new ArmingController();
    const r = a.disarmedResult("prov");
    expect(r.status).toBe("error");
    expect(r.controlBlocked).toBe(true);
  });
});
