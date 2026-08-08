/**
 * Runtime graph: nodes, first-class wire + modulation edges, instances.
 */

import type { OperatorInstance } from "../types/operator.js";
import type { ParamValue } from "../types/params.js";
import { assertAcyclic } from "./topology.js";
import type {
  GraphDocument,
  GraphNode,
  ModulationEdge,
  WireEdge,
} from "./types.js";

export interface RuntimeGraph {
  readonly document: GraphDocument;
  getInstance(id: string): OperatorInstance;
  getInstances(): Iterable<OperatorInstance>;
  getWiresTo(opId: string): WireEdge[];
  getModulationsTo(opId: string): ModulationEdge[];
  getWiresFrom(opId: string): WireEdge[];
  /** Replace/bind instances after registry create (called by evaluator). */
  bindInstance(instance: OperatorInstance): void;
  listOutSinks(): OperatorInstance[];
}

class GraphImpl implements RuntimeGraph {
  readonly document: GraphDocument;
  private readonly instances = new Map<string, OperatorInstance>();
  private readonly wiresTo = new Map<string, WireEdge[]>();
  private readonly wiresFrom = new Map<string, WireEdge[]>();
  private readonly modsTo = new Map<string, ModulationEdge[]>();

  constructor(doc: GraphDocument) {
    this.document = doc;
    for (const w of doc.wires) {
      pushMap(this.wiresTo, w.to.opId, w);
      pushMap(this.wiresFrom, w.from.opId, w);
    }
    for (const m of doc.modulations) {
      pushMap(this.modsTo, m.to.opId, m);
    }
  }

  bindInstance(instance: OperatorInstance): void {
    this.instances.set(instance.id, instance);
  }

  getInstance(id: string): OperatorInstance {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`No operator instance bound for id "${id}"`);
    return inst;
  }

  getInstances(): Iterable<OperatorInstance> {
    return this.instances.values();
  }

  getWiresTo(opId: string): WireEdge[] {
    return this.wiresTo.get(opId) ?? [];
  }

  getWiresFrom(opId: string): WireEdge[] {
    return this.wiresFrom.get(opId) ?? [];
  }

  getModulationsTo(opId: string): ModulationEdge[] {
    return this.modsTo.get(opId) ?? [];
  }

  listOutSinks(): OperatorInstance[] {
    return [...this.instances.values()].filter((op) => op.family === "OUT");
  }
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function normalizeNode(node: GraphNode): GraphNode {
  return {
    ...node,
    params: { ...(node.params ?? {}) } as Record<string, ParamValue>,
  };
}

/**
 * Validate and construct a runtime graph shell (no instances yet).
 * Cycles throw GraphCycleError.
 */
export function createGraph(doc: GraphDocument): RuntimeGraph {
  if (doc.schemaVersion !== 1) {
    throw new Error(
      `Unsupported graph schemaVersion ${String(doc.schemaVersion)}; M0 supports 1`,
    );
  }

  const ids = new Set<string>();
  for (const n of doc.nodes) {
    if (ids.has(n.id)) throw new Error(`Duplicate node id "${n.id}"`);
    ids.add(n.id);
  }

  for (const w of doc.wires) {
    if (!ids.has(w.from.opId)) {
      throw new Error(`Wire "${w.id}" references unknown op "${w.from.opId}"`);
    }
    if (!ids.has(w.to.opId)) {
      throw new Error(`Wire "${w.id}" references unknown op "${w.to.opId}"`);
    }
  }

  for (const m of doc.modulations) {
    if (!ids.has(m.from.opId)) {
      throw new Error(
        `Modulation "${m.id}" references unknown op "${m.from.opId}"`,
      );
    }
    if (!ids.has(m.to.opId)) {
      throw new Error(
        `Modulation "${m.id}" references unknown op "${m.to.opId}"`,
      );
    }
  }

  assertAcyclic(doc);

  const normalized: GraphDocument = {
    ...doc,
    nodes: doc.nodes.map(normalizeNode),
    wires: [...doc.wires],
    modulations: [...doc.modulations],
  };

  return new GraphImpl(normalized);
}
