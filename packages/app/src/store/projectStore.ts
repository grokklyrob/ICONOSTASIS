/**
 * Project document store — graph edits + mode (M1.6 editor shell).
 * Light command stack for undo; no external state lib required for v0.
 */

import type {
  GraphDocument,
  GraphNode,
  ModulationEdge,
  ParamValue,
  PortType,
  WireEdge,
} from "@iconostasis/engine";

export type EditorMode = "edit" | "perform";

export interface ProjectState {
  doc: GraphDocument;
  selection: string | null;
  mode: EditorMode;
  dirty: boolean;
  blackout: boolean;
}

export type Listener = () => void;

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

export function cloneDoc(doc: GraphDocument): GraphDocument {
  return structuredClone(doc) as GraphDocument;
}

export class ProjectStore {
  private state: ProjectState;
  private readonly listeners = new Set<Listener>();
  private readonly undoStack: GraphDocument[] = [];
  private readonly redoStack: GraphDocument[] = [];

  constructor(initial: GraphDocument) {
    this.state = {
      doc: cloneDoc(initial),
      selection: null,
      mode: "edit",
      dirty: false,
      blackout: false,
    };
  }

  getState(): ProjectState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private pushUndo(): void {
    this.undoStack.push(cloneDoc(this.state.doc));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(cloneDoc(this.state.doc));
    this.state = { ...this.state, doc: prev, dirty: true };
    this.emit();
  }

  setMode(mode: EditorMode): void {
    this.state = {
      ...this.state,
      mode,
      blackout: mode === "edit" ? false : this.state.blackout,
    };
    this.emit();
  }

  setBlackout(on: boolean): void {
    this.state = { ...this.state, blackout: on };
    this.emit();
  }

  select(id: string | null): void {
    this.state = { ...this.state, selection: id };
    this.emit();
  }

  replaceDoc(doc: GraphDocument): void {
    this.pushUndo();
    this.state = {
      ...this.state,
      doc: cloneDoc(doc),
      selection: null,
      dirty: false,
    };
    this.emit();
  }

  markClean(): void {
    this.state = { ...this.state, dirty: false };
    this.emit();
  }

  addNode(type: string, position: [number, number], params: Record<string, ParamValue> = {}): string {
    this.pushUndo();
    const id = nextId("op");
    const node: GraphNode = { id, type, params, position };
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        nodes: [...this.state.doc.nodes, node],
      },
      selection: id,
      dirty: true,
    };
    this.emit();
    return id;
  }

  removeNode(id: string): void {
    this.pushUndo();
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        nodes: this.state.doc.nodes.filter((n) => n.id !== id),
        wires: this.state.doc.wires.filter(
          (w) => w.from.opId !== id && w.to.opId !== id,
        ),
        modulations: this.state.doc.modulations.filter(
          (m) => m.from.opId !== id && m.to.opId !== id,
        ),
      },
      selection: this.state.selection === id ? null : this.state.selection,
      dirty: true,
    };
    this.emit();
  }

  setNodePosition(id: string, position: [number, number]): void {
    // Drag: no undo step per move; commit on pointerup via commitPositions
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        nodes: this.state.doc.nodes.map((n) =>
          n.id === id ? { ...n, position } : n,
        ),
      },
      dirty: true,
    };
    this.emit();
  }

  commitHistoryCheckpoint(): void {
    this.pushUndo();
  }

  setParam(opId: string, param: string, value: ParamValue): void {
    this.pushUndo();
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        nodes: this.state.doc.nodes.map((n) =>
          n.id === opId
            ? { ...n, params: { ...n.params, [param]: value } }
            : n,
        ),
      },
      dirty: true,
    };
    this.emit();
  }

  addWire(wire: {
    id?: string;
    from: WireEdge["from"];
    to: WireEdge["to"];
  }): boolean {
    // Reject duplicate
    const exists = this.state.doc.wires.some(
      (w) =>
        w.from.opId === wire.from.opId &&
        w.from.port === wire.from.port &&
        w.to.opId === wire.to.opId &&
        w.to.port === wire.to.port,
    );
    if (exists) return false;
    this.pushUndo();
    const full: WireEdge = {
      id: wire.id ?? nextId("w"),
      from: wire.from,
      to: wire.to,
    };
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        wires: [...this.state.doc.wires, full],
      },
      dirty: true,
    };
    this.emit();
    return true;
  }

  addModulation(mod: {
    id?: string;
    from: ModulationEdge["from"];
    to: ModulationEdge["to"];
    map?: ModulationEdge["map"];
  }): boolean {
    this.pushUndo();
    const full: ModulationEdge = {
      id: mod.id ?? nextId("m"),
      from: mod.from,
      to: mod.to,
      map: mod.map,
    };
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        modulations: [...this.state.doc.modulations, full],
      },
      dirty: true,
    };
    this.emit();
    return true;
  }

  removeWire(id: string): void {
    this.pushUndo();
    this.state = {
      ...this.state,
      doc: {
        ...this.state.doc,
        wires: this.state.doc.wires.filter((w) => w.id !== id),
      },
      dirty: true,
    };
    this.emit();
  }
}

/** Strict port type equality for wire type-check (§7.3). */
export function portsCompatible(a: PortType, b: PortType): boolean {
  return a === b;
}

export function modulatedParamsFor(
  doc: GraphDocument,
  opId: string,
): Set<string> {
  const s = new Set<string>();
  for (const m of doc.modulations) {
    if (m.to.opId === opId) s.add(m.to.param);
  }
  return s;
}
