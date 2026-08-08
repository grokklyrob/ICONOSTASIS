/**
 * Pull-based dirty-flag graph evaluator (architecture.md §7.1).
 * cook is synchronous void — the evaluator never awaits (AMD-01).
 */

import type { RuntimeGraph } from "../graph/graph.js";
import type { OperatorRegistry } from "../registry/registry.js";
import type {
  CookContext,
  EvaluatorHost,
  FrameTime,
  OperatorInstance,
} from "../types/operator.js";
import type { ParamValue } from "../types/params.js";
import { clearDirtyAfterCook, markAlwaysDirty } from "./dirty.js";
import { resolveEffectiveParams } from "./modulation.js";

export class GraphEvaluator {
  private readonly graph: RuntimeGraph;
  private readonly host: EvaluatorHost;
  private readonly cookedThisFrame = new Set<string>();
  private readonly visiting = new Set<string>();
  /** Last outputs per op/port — held across frames for dirty-skip reuse. */
  private readonly outputStore = new Map<string, Map<string, unknown>>();
  private frame: FrameTime = { time: 0, delta: 0, frame: 0 };

  constructor(
    graph: RuntimeGraph,
    registry: OperatorRegistry,
    host: EvaluatorHost = {},
  ) {
    this.graph = graph;
    this.host = host;
    this.instantiateAll(registry);
  }

  private instantiateAll(registry: OperatorRegistry): void {
    for (const node of this.graph.document.nodes) {
      const params = node.params as Record<string, ParamValue>;
      const instance = registry.create(node.type, node.id, params);
      // Ensure base params match document (registry merges defaults).
      instance.params = { ...instance.params, ...params };
      instance.dirty = true;
      this.graph.bindInstance(instance);
    }
  }

  /**
   * Pull-evaluate from all OUT sinks for one frame.
   * Completes synchronously — no Promise.
   */
  tick(frame: FrameTime): void {
    this.frame = frame;
    this.cookedThisFrame.clear();
    this.visiting.clear();

    markAlwaysDirty(this.graph.getInstances());

    for (const sink of this.graph.listOutSinks()) {
      this.ensureCooked(sink.id);
    }
  }

  /** Read a port value: evaluator store first, then instance getOutput. */
  readPort(opId: string, port: string): unknown {
    const stored = this.outputStore.get(opId)?.get(port);
    if (stored !== undefined) return stored;
    return this.graph.getInstance(opId).getOutput(port);
  }

  private ensureCooked(opId: string): void {
    if (this.cookedThisFrame.has(opId)) return;

    if (this.visiting.has(opId)) {
      throw new Error(
        `Re-entrant cook detected for "${opId}" (unexpected cycle during pull)`,
      );
    }
    this.visiting.add(opId);

    const op = this.graph.getInstance(opId);

    // Pull data-wire dependencies first.
    for (const wire of this.graph.getWiresTo(opId)) {
      this.ensureCooked(wire.from.opId);
    }
    // Modulation sources must also be cooked so signal values exist.
    for (const mod of this.graph.getModulationsTo(opId)) {
      this.ensureCooked(mod.from.opId);
    }

    if (!op.dirty) {
      // Clean subtree: reuse last outputs; do not recook.
      this.cookedThisFrame.add(opId);
      this.visiting.delete(opId);
      return;
    }

    this.cookOne(op);
    this.cookedThisFrame.add(opId);
    this.visiting.delete(opId);
  }

  private cookOne(op: OperatorInstance): void {
    const mods = this.graph.getModulationsTo(op.id);
    const effective = resolveEffectiveParams(op.params, mods, (fromOpId, port) =>
      this.readPort(fromOpId, port),
    );

    const inputIndex = new Map<string, unknown>();
    for (const wire of this.graph.getWiresTo(op.id)) {
      inputIndex.set(wire.to.port, this.readPort(wire.from.opId, wire.from.port));
    }

    let opOutputs = this.outputStore.get(op.id);
    if (!opOutputs) {
      opOutputs = new Map();
      this.outputStore.set(op.id, opOutputs);
    }

    const ctx: CookContext = {
      time: this.frame.time,
      delta: this.frame.delta,
      frame: this.frame.frame,
      audio: this.frame.audio,
      loadAsset: this.host.loadAsset,
      renderBackend: this.host.renderBackend,
      getInput: (port) => inputIndex.get(port),
      getParam: (id) => {
        const v = effective[id];
        if (v === undefined) {
          throw new Error(`Param "${id}" not found on op "${op.id}"`);
        }
        return v;
      },
      getBaseParam: (id) => op.params[id],
      setOutput: (port, value) => {
        opOutputs.set(port, value);
      },
    };

    // AMD-01: cook returns void; evaluator never awaits.
    const result: void = op.cook(ctx);
    void result;

    clearDirtyAfterCook(op);
  }
}
