/**
 * ICONOSTASIS editor shell — M1.6 graph + viewport + Perform Mode v0.
 * architecture.md §7.3, §5 aesthetic, §18 M1.
 */

import { RuntimeHost } from "./engine/runtimeHost.js";
import { seraphGraph } from "./fixtures/seraphGraph.js";
import { GraphCanvas } from "./graph/GraphCanvas.js";
import { ArrivalProbeHost } from "./probe/arrivalProbe.js";
import { ProjectStore } from "./store/projectStore.js";
import { mountArrivalProbePanel } from "./ui/arrivalProbePanel.js";
import { mountInspector } from "./ui/inspector.js";
import { mountPalette } from "./ui/palette.js";
import { mountPerformHud } from "./ui/perform.js";

const app = document.querySelector<HTMLElement>("#app")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const enter = document.querySelector<HTMLButtonElement>("#enter")!;
const svg = document.querySelector<SVGSVGElement>("#graph-svg")!;
const world = document.querySelector<SVGGElement>("#graph-world")!;
const nodesLayer = document.querySelector<SVGGElement>("#nodes-layer")!;
const wiresLayer = document.querySelector<SVGGElement>("#wires-layer")!;
const draft = document.querySelector<SVGPathElement>("#wire-draft")!;
const paletteList = document.querySelector<HTMLElement>("#palette-list")!;
const paletteSearch = document.querySelector<HTMLInputElement>("#palette-search")!;
const inspectorBody = document.querySelector<HTMLElement>("#inspector-body")!;
const performHud = document.querySelector<HTMLElement>("#perform-hud")!;
const performControls = document.querySelector<HTMLElement>("#perform-controls")!;
const btnPerform = document.querySelector<HTMLButtonElement>("#btn-perform")!;
const btnEdit = document.querySelector<HTMLButtonElement>("#btn-edit")!;
const btnAdd = document.querySelector<HTMLButtonElement>("#btn-add")!;
const btnSave = document.querySelector<HTMLButtonElement>("#btn-save")!;
const btnOpen = document.querySelector<HTMLInputElement>("#btn-open")!;
const btnPanic = document.querySelector<HTMLButtonElement>("#btn-panic")!;
const arrivalProbeEl = document.querySelector<HTMLElement>("#arrival-probe")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
  console.info(`[app] ${msg}`);
}

const store = new ProjectStore(seraphGraph);
const host = new RuntimeHost(canvas, store, setStatus);
const registry = host.getRegistry();
const arrivalProbe = new ArrivalProbeHost();

const graphCanvas = new GraphCanvas(
  svg,
  world,
  nodesLayer,
  wiresLayer,
  draft,
  store,
  registry,
);
mountPalette(paletteList, paletteSearch, registry, store);
mountInspector(inspectorBody, store, registry);
mountPerformHud(performControls, store, registry);
mountArrivalProbePanel(arrivalProbeEl, arrivalProbe);

void host.initAutosave();

function applyChrome(): void {
  const { mode, blackout } = store.getState();
  const isPerform = mode === "perform";
  app.classList.toggle("mode-perform", isPerform);
  app.classList.toggle("mode-edit", !isPerform);
  app.classList.toggle("blackout", isPerform && blackout);
  // Defense in depth with CSS: attribute + class hide BLACK in edit.
  performHud.hidden = !isPerform;
  btnPerform.hidden = isPerform;
  btnEdit.hidden = !isPerform;
}

store.subscribe(() => {
  applyChrome();
});
applyChrome();

// Refit graph when the window / pane size changes.
window.addEventListener("resize", () => {
  if (store.getState().mode === "edit") graphCanvas.fitToView();
});

enter.addEventListener(
  "click",
  () => {
    enter.hidden = true;
    void host.enter();
  },
  { once: true },
);

btnPerform.addEventListener("click", () => store.setMode("perform"));
btnEdit.addEventListener("click", () => {
  store.setBlackout(false);
  store.setMode("edit");
  // Graph pane becomes visible again — re-fit after layout.
  requestAnimationFrame(() => graphCanvas.fitToView());
});
btnPanic.addEventListener("click", () => {
  if (store.getState().mode !== "perform") return;
  store.setBlackout(!store.getState().blackout);
});

btnAdd.addEventListener("click", () => {
  paletteSearch.focus();
});

window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const inField =
    t.tagName === "INPUT" ||
    t.tagName === "SELECT" ||
    t.tagName === "TEXTAREA";

  if (e.key === "Tab" && store.getState().mode === "edit") {
    e.preventDefault();
    paletteSearch.focus();
  }
  if ((e.key === "f" || e.key === "F") && !inField && !e.ctrlKey && !e.metaKey) {
    if (store.getState().mode === "edit") {
      e.preventDefault();
      graphCanvas.fitToView();
    }
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (inField) return;
    const id = store.getState().selection;
    if (id) store.removeNode(id);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    store.undo();
  }
});

btnSave.addEventListener("click", () => {
  void (async () => {
    try {
      const bytes = await host.packCurrent();
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/zip",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "project.icx";
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("downloaded project.icx");
    } catch (err) {
      setStatus(
        `save failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
});

btnOpen.addEventListener("change", () => {
  const file = btnOpen.files?.[0];
  if (!file) return;
  void file.arrayBuffer().then(async (buf) => {
    await host.loadIcx(new Uint8Array(buf));
    requestAnimationFrame(() => graphCanvas.fitToView());
  });
});

setStatus("editor ready · Enter to arm audio + viewport");
