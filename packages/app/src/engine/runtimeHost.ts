/**
 * Engine host — graph evaluator + WebGL viewport + audio (§17 app layer).
 */

import {
  AutosaveRing,
  createAutosaveStore,
  createGraph,
  createDefaultManifest,
  deserializeGraph,
  GraphEvaluator,
  MemoryAutosaveStore,
  OperatorRegistry,
  packIcx,
  PointGovernor,
  registerM1Operators,
  ThreeWebGLBackend,
  unpackIcx,
  type GraphDocument,
  runCapabilityProbe,
  type AudioFrameSnapshot,
} from "@iconostasis/engine";
import type { ProjectStore } from "../store/projectStore.js";

export class RuntimeHost {
  private registry = new OperatorRegistry();
  private evaluator: GraphEvaluator | null = null;
  private backend: ThreeWebGLBackend | null = null;
  private raf = 0;
  private running = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq = new Uint8Array(0);
  private t0 = 0;
  private frame = 0;
  private autosave: AutosaveRing | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private governor: PointGovernor | null = null;
  private lastDocKey = "";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: ProjectStore,
    private readonly setStatus: (s: string) => void,
  ) {
    registerM1Operators(this.registry);
  }

  getRegistry(): OperatorRegistry {
    return this.registry;
  }

  async initAutosave(): Promise<void> {
    const { store, backend } = await createAutosaveStore();
    this.autosave = new AutosaveRing(store);
    this.setStatus(`autosave: ${backend}`);
  }

  async enter(): Promise<void> {
    if (!this.backend) {
      this.backend = new ThreeWebGLBackend({
        canvas: this.canvas,
        fov: 50,
        cameraZ: 2.35,
      });
    }
    this.audioCtx = new AudioContext();
    await this.audioCtx.resume();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    try {
      const res = await fetch("/test-drone.ogg");
      const buf = await res.arrayBuffer();
      const audioBuf = await this.audioCtx.decodeAudioData(buf.slice(0));
      const src = this.audioCtx.createBufferSource();
      src.buffer = audioBuf;
      src.loop = true;
      src.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      src.start();
    } catch {
      this.setStatus("audio bed missing — graph still cooks");
    }

    const probe = runCapabilityProbe({
      medianFrameMs: 16,
      backend: "webgl2",
      floatColorBuffer: false,
    });
    this.governor = new PointGovernor(probe.budgets.pointBudget);

    this.rebuildEvaluator();
    this.t0 = performance.now();
    this.running = true;
    this.loop();
    this.setStatus("running · patched graph");
  }

  private rebuildEvaluator(): void {
    const doc = this.store.getState().doc;
    this.lastDocKey = JSON.stringify(doc);
    const graph = createGraph(deserializeGraph(doc));
    this.evaluator = new GraphEvaluator(graph, this.registry, {
      loadAsset: async (path) => {
        const url = path.startsWith("assets/")
          ? `/${path.slice("assets/".length)}`
          : `/${path}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`loadAsset ${path}: ${res.status}`);
        return res.arrayBuffer();
      },
      renderBackend: this.backend ?? undefined,
      pointGovernor: this.governor ?? undefined,
      // Fake latency for TEST/SyntheticAsync on the graph (AMD-01: never await cook).
      scheduleDeferred: (fn, delayMs) => {
        window.setTimeout(fn, Math.max(0, delayMs));
      },
      probeResult: runCapabilityProbe({
        medianFrameMs: 16,
        backend: "webgl2",
        floatColorBuffer: false,
      }),
    });
  }

  /** Call when graph document changes structure. */
  syncGraphIfNeeded(): void {
    if (!this.running) return;
    const key = JSON.stringify(this.store.getState().doc);
    if (key !== this.lastDocKey) {
      this.governor?.reset();
      this.rebuildEvaluator();
      this.scheduleAutosave();
    }
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    // Debounce ≤15s (§12.1) — use 2s for responsive editor v0
    this.autosaveTimer = setTimeout(() => {
      void this.persistAutosave();
    }, 2000);
  }

  private async persistAutosave(): Promise<void> {
    if (!this.autosave) return;
    try {
      const bytes = await this.packCurrent();
      const meta = await this.autosave.save(bytes, "autosave");
      this.store.markClean();
      this.setStatus(`autosaved slot ${meta.slot}`);
    } catch (err) {
      this.setStatus(
        `autosave failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async packCurrent(): Promise<Uint8Array> {
    const doc = this.store.getState().doc;
    return packIcx({
      manifest: createDefaultManifest({
        title: "ICONOSTASIS Project",
        assets: [],
      }),
      graph: doc,
      story: { schemaVersion: 1, stations: [] },
      assets: [],
    });
  }

  async loadIcx(bytes: Uint8Array): Promise<void> {
    const project = unpackIcx(bytes);
    const doc = deserializeGraph(project.graph);
    this.store.replaceDoc(doc);
    if (this.running) {
      this.governor?.reset();
      this.rebuildEvaluator();
    }
    this.setStatus("opened .icx");
  }

  private audioSnapshot(): AudioFrameSnapshot | undefined {
    if (!this.analyser) return undefined;
    this.analyser.getByteFrequencyData(this.freq);
    const frequency = new Float32Array(this.freq.length);
    for (let i = 0; i < this.freq.length; i++) {
      frequency[i] = (this.freq[i] ?? 0) / 255;
    }
    return {
      active: true,
      sampleRate: this.audioCtx?.sampleRate ?? 48000,
      frequency,
    };
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.syncGraphIfNeeded();
    if (!this.evaluator) return;
    if (this.store.getState().blackout) return;

    const now = performance.now();
    const time = (now - this.t0) / 1000;
    const delta = 1 / 60;
    this.frame += 1;
    this.evaluator.tick({
      time,
      delta,
      frame: this.frame,
      audio: this.audioSnapshot(),
    });
  };

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.backend?.dispose();
    void this.audioCtx?.close();
  }
}

// silence unused import in case tree shakes oddly
void MemoryAutosaveStore;
