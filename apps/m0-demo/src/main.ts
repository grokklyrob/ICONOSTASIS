/**
 * M0 demo shell — thin host only (architecture.md §18).
 *
 * Acceptance: audio-reactive seraph, **patched not coded**.
 * Displacement / bloom / pointSize couplings live only in
 * packages/engine/src/graph/fixtures/m0-seraph.graph.json modulations.
 * This file must not assign bloom.strength or displacement from audio.
 */

import {
  createGraph,
  deserializeGraph,
  GraphEvaluator,
  OperatorRegistry,
  registerM0Operators,
  ThreeWebGLBackend,
} from "@iconostasis/engine";
import seraphGraph from "../../../packages/engine/src/graph/fixtures/m0-seraph.graph.json";
import { AudioHost } from "./audioHost.js";
import { startFrameLoop } from "./frameLoop.js";
import { loadAsset } from "./loadAsset.js";

const enter = document.querySelector<HTMLButtonElement>("#enter");
const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
const fileInput = document.querySelector<HTMLInputElement>("#music");
const statusEl = document.querySelector<HTMLElement>("#status");

if (!enter || !canvas) {
  throw new Error("M0 demo shell missing #enter or #viewport");
}

function setStatus(msg: string): void {
  if (statusEl) statusEl.textContent = msg;
  console.info(`[m0-demo] ${msg}`);
}

function buildEngine(backend: ThreeWebGLBackend): GraphEvaluator {
  const registry = new OperatorRegistry();
  registerM0Operators(registry);
  const doc = deserializeGraph(seraphGraph);
  const graph = createGraph(doc);
  return new GraphEvaluator(graph, registry, {
    loadAsset,
    renderBackend: backend,
  });
}

enter.addEventListener(
  "click",
  () => {
    void (async () => {
      enter.hidden = true;
      setStatus("entering…");

      const backend = new ThreeWebGLBackend({ canvas, fov: 50, cameraZ: 2.35 });
      const evaluator = buildEngine(backend);
      const audio = new AudioHost(2048);

      try {
        await audio.resume();
        await audio.playUrl("/test-drone.ogg");
        setStatus("seraph loading · music playing");
      } catch (err) {
        setStatus(
          `audio failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (fileInput) {
        fileInput.hidden = false;
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          void audio.playFile(file).then(() => {
            setStatus(`playing ${file.name}`);
          });
        });
      }

      // No audio→param assignments here — graph modulations only.
      startFrameLoop(evaluator, () => audio.snapshot());
      setStatus("patched seraph running (graph wires + modulations)");
    })();
  },
  { once: true },
);
