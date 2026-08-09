/**
 * Perform-mode GEN arming control (§9.4).
 * Default disarmed in perform; explicit Arm required for invokes.
 */

import type { GenHost } from "../gen/genHost.js";
import type { ProjectStore } from "../store/projectStore.js";

export function mountArmingHud(
  root: HTMLElement,
  store: ProjectStore,
  gen: GenHost,
): void {
  const render = (): void => {
    // Read-only: this is a gen.subscribe listener, so writing to `gen` here
    // re-enters emit() and recurses until the stack blows. Mode syncing is
    // main.ts's job on the store subscription.
    const { mode } = store.getState();
    root.replaceChildren();
    if (mode !== "perform") return;

    const armed = gen.stack.arming.globalArmedFor("perform");
    const spend = gen.stack.spend.snapshot();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = armed ? "arm-btn armed" : "arm-btn";
    btn.textContent = armed ? "GEN Armed" : "GEN Disarmed";
    btn.title = armed
      ? "Click to disarm provider invokes"
      : "Click to arm GEN for this performance";
    btn.addEventListener("click", () => {
      gen.setGlobalArmed("perform", !armed);
    });
    root.appendChild(btn);

    const meter = document.createElement("span");
    meter.className = "spend-meter";
    meter.textContent = `${spend.used}/${spend.ceiling} ${spend.unit}`;
    if (spend.hardStopped) meter.classList.add("hard-stop");
    root.appendChild(meter);
  };

  store.subscribe(render);
  gen.subscribe(render);
  render();
}
