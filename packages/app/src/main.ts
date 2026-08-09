/**
 * ICONOSTASIS editor shell — graph + viewport + Perform + GEN (M2).
 * architecture.md §7.3, §5, §9, §18 M2.
 */

import { RuntimeHost } from "./engine/runtimeHost.js";
import { m2OracleGraph } from "./fixtures/m2OracleGraph.js";
import { seraphGraph } from "./fixtures/seraphGraph.js";
import { GenHost } from "./gen/genHost.js";
import { GraphCanvas } from "./graph/GraphCanvas.js";
import { ArrivalProbeHost } from "./probe/arrivalProbe.js";
import { ProjectStore } from "./store/projectStore.js";
import { mountArmingHud } from "./ui/armingHud.js";
import { mountArrivalProbePanel } from "./ui/arrivalProbePanel.js";
import { mountInspector } from "./ui/inspector.js";
import { mountPalette } from "./ui/palette.js";
import { mountPerformHud } from "./ui/perform.js";
import { mountProvidersPanel } from "./ui/providersPanel.js";

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
const performArming = document.querySelector<HTMLElement>("#perform-arming")!;
const btnPerform = document.querySelector<HTMLButtonElement>("#btn-perform")!;
const btnEdit = document.querySelector<HTMLButtonElement>("#btn-edit")!;
const btnAdd = document.querySelector<HTMLButtonElement>("#btn-add")!;
const btnSave = document.querySelector<HTMLButtonElement>("#btn-save")!;
const btnOpen = document.querySelector<HTMLInputElement>("#btn-open")!;
const btnPanic = document.querySelector<HTMLButtonElement>("#btn-panic")!;
const btnProviders = document.querySelector<HTMLButtonElement>("#btn-providers")!;
const btnM2 = document.querySelector<HTMLButtonElement>("#btn-m2")!;
const btnFireOracle = document.querySelector<HTMLButtonElement>("#btn-fire-oracle")!;
const providersDialog = document.querySelector<HTMLDialogElement>("#providers-dialog")!;
const providersPanel = document.querySelector<HTMLElement>("#providers-panel")!;
const arrivalProbeEl = document.querySelector<HTMLElement>("#arrival-probe")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
  console.info(`[app] ${msg}`);
}

const store = new ProjectStore(seraphGraph);
const host = new RuntimeHost(canvas, store, setStatus);
const genHost = new GenHost();
host.setVaultSecretsProvider(() => genHost.vaultSecretsForTaint());
host.setGenHost(genHost);
host.setProvenanceProvider(() => genHost.provenanceDoc());
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
mountArmingHud(performArming, store, genHost);
mountArrivalProbePanel(arrivalProbeEl, arrivalProbe);
mountProvidersPanel(providersPanel, genHost, { onStatus: setStatus });

void host.initAutosave();

btnProviders.addEventListener("click", () => {
  if (typeof providersDialog.showModal === "function") {
    providersDialog.showModal();
  } else {
    providersDialog.setAttribute("open", "");
  }
});

btnM2.addEventListener("click", () => {
  store.replaceDoc(m2OracleGraph);
  host.syncGraphIfNeeded();
  requestAnimationFrame(() => graphCanvas.fitToView());
  setStatus(
    "M2 demo loaded · Enter · Fire Oracle (edit armed) · Perform needs Arm",
  );
});

btnFireOracle.addEventListener("click", () => {
  const oracle = store
    .getState()
    .doc.nodes.find((n) => n.type === "GEN/Oracle");
  if (!oracle) {
    setStatus("no GEN/Oracle in graph — click M2 demo first");
    return;
  }
  const mode = store.getState().mode;
  genHost.syncMode(mode);
  if (!genHost.stack.arming.isArmed()) {
    setStatus("GEN disarmed — Arm in Providers or Perform HUD");
    return;
  }
  const nextFire = Math.floor(Number(oracle.params.fire ?? 0)) + 1;
  store.setParam(oracle.id, "fire", nextFire);
  setStatus(`Oracle fire → ${nextFire} (Ollama if local-ollama up)`);
});

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
  genHost.syncMode(store.getState().mode);
});
applyChrome();
genHost.syncMode(store.getState().mode);

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
