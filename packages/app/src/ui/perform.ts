/**
 * Perform Mode v0 — exposable params as live controls; graph hidden (§7.3).
 */

import type { OperatorRegistry } from "@iconostasis/engine";
import type { ProjectStore } from "../store/projectStore.js";

export function mountPerformHud(
  controlsEl: HTMLElement,
  store: ProjectStore,
  registry: OperatorRegistry,
): void {
  const render = (): void => {
    const { doc, mode } = store.getState();
    if (mode !== "perform") {
      controlsEl.replaceChildren();
      return;
    }
    controlsEl.replaceChildren();
    for (const node of doc.nodes) {
      let factory;
      try {
        factory = registry.get(node.type);
      } catch {
        continue;
      }
      for (const spec of factory.params) {
        if (!spec.exposable) continue;
        if (spec.type !== "float" && spec.type !== "int") continue;
        const box = document.createElement("div");
        box.className = "perform-control";
        const label = document.createElement("label");
        label.textContent = `${node.id}.${spec.id}`;
        box.appendChild(label);
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(spec.min ?? 0);
        range.max = String(spec.max ?? (spec.type === "int" ? 10 : 2));
        range.step = String(spec.step ?? (spec.type === "int" ? 1 : 0.01));
        range.value = String(node.params[spec.id] ?? spec.default);
        range.addEventListener("input", () => {
          store.setParam(node.id, spec.id, Number(range.value));
        });
        box.appendChild(range);
        controlsEl.appendChild(box);
      }
    }
  };
  store.subscribe(render);
  render();
}
