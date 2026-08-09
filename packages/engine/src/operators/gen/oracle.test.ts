import { describe, expect, it } from "vitest";
import type { GenCookHost } from "../../types/genHost.js";
import type { OperatorInstance } from "../../types/operator.js";
import { oracleFactory, type OracleView } from "./oracle.js";

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

type OracleOp = OperatorInstance & { oracleView: OracleView };

describe("GEN/Oracle", () => {
  it("streams text via genHost without blocking cook", async () => {
    const host: GenCookHost = {
      async invoke(req) {
        req.onDelta?.("Ky");
        req.onDelta?.("rie");
        return { status: "ok", text: "Kyrie", usage: { totalTokens: 2 } };
      },
    };
    const op = oracleFactory.create("or", {
      fire: 0,
      stream: true,
      triggerMode: "manual",
      minIntervalMs: 0,
      providerInstanceId: "p",
      maxTokens: 32,
      temperature: 0,
      seed: 0,
      system: "",
      model: "",
      threshold: 0.5,
      cacheScope: "station",
      stationId: "default",
    }) as OracleOp;

    const cook = (fire: number, prompt: string) => {
      op.params.fire = fire;
      op.cook({
        time: fire,
        delta: 0.016,
        frame: fire,
        genHost: host,
        getInput: (p) => (p === "prompt" ? prompt : undefined),
        getParam: (id) => op.params[id]!,
        getBaseParam: (id) => op.params[id],
        setOutput: () => undefined,
      });
    };

    cook(0, "chant");
    expect(op.oracleView.status).toBe("idle");
    cook(1, "chant");
    // Host may settle same-tick for sync mocks; allow pending or fresh.
    expect(["pending", "fresh"]).toContain(op.oracleView.status);
    await flush();
    cook(1, "chant");
    expect(op.oracleView.presented).toBe("Kyrie");
    expect(op.oracleView.status).toBe("fresh");
  });

  it("errors when genHost missing on fire", () => {
    const op = oracleFactory.create("or2", {
      fire: 1,
      stream: true,
      triggerMode: "manual",
      minIntervalMs: 0,
      providerInstanceId: "",
      maxTokens: 16,
      temperature: 0,
      seed: 0,
      system: "",
      model: "",
      threshold: 0.5,
      cacheScope: "station",
      stationId: "default",
    }) as OracleOp;
    op.cook({
      time: 1,
      delta: 0.016,
      frame: 1,
      getInput: (p) => (p === "prompt" ? "x" : undefined),
      getParam: (id) => op.params[id]!,
      getBaseParam: (id) => op.params[id],
      setOutput: () => undefined,
    });
    expect(op.oracleView.status).toBe("error");
  });
});
