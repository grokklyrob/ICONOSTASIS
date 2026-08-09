/**
 * Pull-based dirty-flag graph evaluator (architecture.md §7.1).
 * cook is synchronous void — the evaluator never awaits (AMD-01).
 */

import type { RuntimeGraph } from "../graph/graph.js";
import { FX_FEEDBACK_TYPE } from "../operators/fx/feedback.js";
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

  /**
   * Instance access for host-side sinks (§11.1): OUT/AudioOut and friends
   * publish state on the instance rather than through an output port, because
   * the engine stays headless and the host owns Web Audio / GPU.
   */
  getInstance(opId: string): OperatorInstance {
    return this.graph.getInstance(opId);
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
    const isFeedback = op.type === FX_FEEDBACK_TYPE;

    // Feedback breaks cycles: do not pull data-wire deps before publishing delay.
    if (!isFeedback) {
      for (const wire of this.graph.getWiresTo(opId)) {
        this.ensureCooked(wire.from.opId);
      }
    }
    // Modulation sources must also be cooked so signal values exist.
    for (const mod of this.graph.getModulationsTo(opId)) {
      this.ensureCooked(mod.from.opId);
    }

    if (!op.dirty) {
      this.cookedThisFrame.add(opId);
      this.visiting.delete(opId);
      return;
    }

    if (isFeedback) {
      this.cookFeedback(op);
    } else {
      this.cookOne(op);
    }
    this.cookedThisFrame.add(opId);
    this.visiting.delete(opId);
  }

  /**
   * FX/Feedback: publish previous-frame value, then sample input for next frame.
   * Input subgraph is pulled after the delayed output is available (§7.1).
   */
  private cookFeedback(op: OperatorInstance): void {
    const mods = this.graph.getModulationsTo(op.id);
    const effective = resolveEffectiveParams(op.params, mods, (fromOpId, port) =>
      this.readPort(fromOpId, port),
    );

    let opOutputs = this.outputStore.get(op.id);
    if (!opOutputs) {
      opOutputs = new Map();
      this.outputStore.set(op.id, opOutputs);
    }

    // 1) Publish delayed value without needing current input.
    const publishCtx = this.makeCtx(op, effective, new Map(), opOutputs);
    op.cook(publishCtx);

    // 2) Pull input deps now (cycle is broken by delay) and sample.
    const inputIndex = new Map<string, unknown>();
    for (const wire of this.graph.getWiresTo(op.id)) {
      this.ensureCooked(wire.from.opId);
      inputIndex.set(wire.to.port, this.readPort(wire.from.opId, wire.from.port));
    }
    const sampleCtx = this.makeCtx(op, effective, inputIndex, opOutputs);
    // Second cook call with inputs present — Feedback samples into delay buffer.
    op.cook(sampleCtx);

    clearDirtyAfterCook(op);
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

    const ctx = this.makeCtx(op, effective, inputIndex, opOutputs);
    const result: void = op.cook(ctx);
    void result;

    clearDirtyAfterCook(op);
  }

  private makeCtx(
    op: OperatorInstance,
    effective: Record<string, ParamValue>,
    inputIndex: Map<string, unknown>,
    opOutputs: Map<string, unknown>,
  ): CookContext {
    return {
      time: this.frame.time,
      delta: this.frame.delta,
      frame: this.frame.frame,
      audio: this.frame.audio,
      input: this.frame.input,
      midi: this.frame.midi,
      loadAsset: this.host.loadAsset,
      renderBackend: this.host.renderBackend,
      scheduleDeferred: this.host.scheduleDeferred,
      pointGovernor: this.host.pointGovernor,
      probeResult: this.host.probeResult,
      deviceTier: this.host.probeResult?.tier,
      genHost: this.host.genHost,
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
  }
}
