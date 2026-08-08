/**
 * Operator palette with search (§7.3).
 */

import type { OperatorRegistry } from "@iconostasis/engine";
import type { ProjectStore } from "../store/projectStore.js";

export function mountPalette(
  listEl: HTMLElement,
  searchEl: HTMLInputElement,
  registry: OperatorRegistry,
  store: ProjectStore,
  onPick?: (type: string) => void,
): void {
  const render = (): void => {
    const q = searchEl.value.trim().toLowerCase();
    listEl.replaceChildren();
    const types = registry.listTypes().filter((type) => {
      if (q && !type.toLowerCase().includes(q)) return false;
      // Show TEST probe ops only when searching "test" / "probe" / "async"
      if (type.startsWith("TEST/")) {
        return (
          q.includes("test") ||
          q.includes("probe") ||
          q.includes("async") ||
          q.includes("synthetic")
        );
      }
      return true;
    });
    for (const type of types) {
      let family = "SRC";
      try {
        family = registry.get(type).family;
      } catch {
        /* */
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `palette-item fam-${family}`;
      btn.textContent = type.startsWith("TEST/")
        ? `${type} (probe)`
        : type;
      btn.addEventListener("click", () => {
        if (onPick) onPick(type);
        else {
          store.addNode(type, [
            120 + Math.random() * 80,
            100 + Math.random() * 80,
          ]);
        }
      });
      listEl.appendChild(btn);
    }
  };
  searchEl.addEventListener("input", render);
  render();
}
