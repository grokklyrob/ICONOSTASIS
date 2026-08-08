/**
 * SVG graph canvas — pan/zoom, nodes, type-checked wiring (§7.3).
 */

import type { OperatorRegistry, PortType } from "@iconostasis/engine";
import {
  portsCompatible,
  type ProjectStore,
} from "../store/projectStore.js";
import {
  layoutPorts,
  NODE_W,
  nodeHeight,
  wirePath,
  type PortGeom,
} from "./portLayout.js";

interface WireDrag {
  fromOp: string;
  fromPort: string;
  fromType: PortType;
  fromKind: "out";
  x0: number;
  y0: number;
}

export class GraphCanvas {
  private panX = 40;
  private panY = 40;
  /** Start slightly zoomed out; fitToView refines on load. */
  private scale = 0.75;
  private draggingNode: { id: string; ox: number; oy: number } | null = null;
  private wireDrag: WireDrag | null = null;
  private panning: { x: number; y: number; px: number; py: number } | null =
    null;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly world: SVGGElement,
    private readonly nodesLayer: SVGGElement,
    private readonly wiresLayer: SVGGElement,
    private readonly draft: SVGPathElement,
    private readonly store: ProjectStore,
    private readonly registry: OperatorRegistry,
  ) {
    this.svg.addEventListener("wheel", this.onWheel, { passive: false });
    this.svg.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.store.subscribe(() => this.render());
    this.render();
    // Wait a frame so the SVG has a real client size for fit-to-view.
    requestAnimationFrame(() => {
      this.fitToView();
      // Second pass after layout settles (flex panes).
      requestAnimationFrame(() => this.fitToView());
    });
  }

  /**
   * Pan/zoom so all nodes are visible with padding.
   * Caps scale at 0.92 so first paint feels slightly zoomed out (§7.3 shell UX).
   */
  fitToView(padding = 56): void {
    const { doc } = this.store.getState();
    const rect = this.svg.getBoundingClientRect();
    const vw = Math.max(rect.width, 1);
    const vh = Math.max(rect.height, 1);

    if (doc.nodes.length === 0) {
      this.scale = 0.75;
      this.panX = 40;
      this.panY = 40;
      this.applyTransform();
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of doc.nodes) {
      const [x, y] = n.position ?? [0, 0];
      let h = 72;
      try {
        h = nodeHeight(this.registry.get(n.type));
      } catch {
        /* unknown type — use default height */
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + h);
    }

    const contentW = Math.max(maxX - minX, NODE_W) + padding * 2;
    const contentH = Math.max(maxY - minY, 72) + padding * 2;
    // Prefer fitting in view; never auto-zoom past ~0.92 (start "zoomed out").
    const raw = Math.min(vw / contentW, vh / contentH, 0.92);
    this.scale = Math.min(2.5, Math.max(0.35, raw));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.panX = vw / 2 - cx * this.scale;
    this.panY = vh / 2 - cy * this.scale;
    this.applyTransform();
  }

  private clientToWorld(clientX: number, clientY: number): [number, number] {
    const rect = this.svg.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.scale;
    const y = (clientY - rect.top - this.panY) / this.scale;
    return [x, y];
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    this.scale = Math.min(2.5, Math.max(0.35, this.scale * factor));
    this.applyTransform();
  };

  private applyTransform(): void {
    this.world.setAttribute(
      "transform",
      `translate(${this.panX},${this.panY}) scale(${this.scale})`,
    );
  }

  private onPointerDown = (e: PointerEvent): void => {
    const t = e.target as Element;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.panning = {
        x: e.clientX,
        y: e.clientY,
        px: this.panX,
        py: this.panY,
      };
      return;
    }
    const portEl = t.closest("[data-port]") as SVGElement | null;
    if (portEl && e.button === 0) {
      const opId = portEl.dataset.op!;
      const port = portEl.dataset.port!;
      const kind = portEl.dataset.kind as PortGeom["kind"];
      const portType = portEl.dataset.portType as PortType;
      if (kind === "out") {
        const [x, y] = this.clientToWorld(e.clientX, e.clientY);
        this.wireDrag = {
          fromOp: opId,
          fromPort: port,
          fromType: portType,
          fromKind: "out",
          x0: x,
          y0: y,
        };
        this.draft.setAttribute("visibility", "visible");
      }
      e.stopPropagation();
      return;
    }
    const nodeEl = t.closest("[data-node]") as SVGElement | null;
    if (nodeEl && e.button === 0) {
      const id = nodeEl.dataset.node!;
      this.store.select(id);
      const node = this.store.getState().doc.nodes.find((n) => n.id === id);
      const [wx, wy] = this.clientToWorld(e.clientX, e.clientY);
      const pos = node?.position ?? [0, 0];
      this.draggingNode = {
        id,
        ox: wx - pos[0],
        oy: wy - pos[1],
      };
      this.store.commitHistoryCheckpoint();
      e.stopPropagation();
      return;
    }
    if (e.button === 0) this.store.select(null);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.panning) {
      this.panX = this.panning.px + (e.clientX - this.panning.x);
      this.panY = this.panning.py + (e.clientY - this.panning.y);
      this.applyTransform();
      return;
    }
    if (this.draggingNode) {
      const [wx, wy] = this.clientToWorld(e.clientX, e.clientY);
      this.store.setNodePosition(this.draggingNode.id, [
        wx - this.draggingNode.ox,
        wy - this.draggingNode.oy,
      ]);
      return;
    }
    if (this.wireDrag) {
      const [x, y] = this.clientToWorld(e.clientX, e.clientY);
      this.draft.setAttribute(
        "d",
        wirePath(this.wireDrag.x0, this.wireDrag.y0, x, y),
      );
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.panning) {
      this.panning = null;
      return;
    }
    if (this.draggingNode) {
      this.draggingNode = null;
      return;
    }
    if (this.wireDrag) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const portEl = el?.closest?.("[data-port]") as SVGElement | null;
      if (portEl) {
        const toOp = portEl.dataset.op!;
        const toPort = portEl.dataset.port!;
        const kind = portEl.dataset.kind as PortGeom["kind"];
        const toType = portEl.dataset.portType as PortType;
        if (kind === "in" && portsCompatible(this.wireDrag.fromType, toType)) {
          this.store.addWire({
            from: {
              opId: this.wireDrag.fromOp,
              port: this.wireDrag.fromPort,
            },
            to: { opId: toOp, port: toPort },
          });
        } else if (
          kind === "param" &&
          this.wireDrag.fromType === "signal"
        ) {
          this.store.addModulation({
            from: {
              opId: this.wireDrag.fromOp,
              port: this.wireDrag.fromPort,
            },
            to: { opId: toOp, param: toPort },
            map: { in: [0, 1], out: [0, 1] },
          });
        }
      }
      this.wireDrag = null;
      this.draft.setAttribute("visibility", "hidden");
      this.draft.setAttribute("d", "");
    }
  };

  render(): void {
    this.applyTransform();
    const { doc, selection } = this.store.getState();
    this.nodesLayer.replaceChildren();
    this.wiresLayer.replaceChildren();

    const pos = new Map<string, [number, number]>();
    for (const n of doc.nodes) {
      pos.set(n.id, n.position ?? [0, 0]);
    }

    // Wires
    for (const w of doc.wires) {
      const fromNode = doc.nodes.find((n) => n.id === w.from.opId);
      const toNode = doc.nodes.find((n) => n.id === w.to.opId);
      if (!fromNode || !toNode) continue;
      let factoryFrom;
      let factoryTo;
      try {
        factoryFrom = this.registry.get(fromNode.type);
        factoryTo = this.registry.get(toNode.type);
      } catch {
        continue;
      }
      const fp = layoutPorts(factoryFrom, pos.get(fromNode.id) ?? [0, 0]).find(
        (p) => p.kind === "out" && p.id === w.from.port,
      );
      const tp = layoutPorts(factoryTo, pos.get(toNode.id) ?? [0, 0]).find(
        (p) => p.kind === "in" && p.id === w.to.port,
      );
      if (!fp || !tp) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "wire");
      path.setAttribute("d", wirePath(fp.x, fp.y, tp.x, tp.y));
      path.dataset.wire = w.id;
      this.wiresLayer.appendChild(path);
    }

    // Modulations as dashed wires to param ports
    for (const m of doc.modulations) {
      const fromNode = doc.nodes.find((n) => n.id === m.from.opId);
      const toNode = doc.nodes.find((n) => n.id === m.to.opId);
      if (!fromNode || !toNode) continue;
      let factoryFrom;
      let factoryTo;
      try {
        factoryFrom = this.registry.get(fromNode.type);
        factoryTo = this.registry.get(toNode.type);
      } catch {
        continue;
      }
      const fp = layoutPorts(factoryFrom, pos.get(fromNode.id) ?? [0, 0]).find(
        (p) => p.kind === "out" && p.id === m.from.port,
      );
      const tp = layoutPorts(factoryTo, pos.get(toNode.id) ?? [0, 0]).find(
        (p) => p.kind === "param" && p.id === m.to.param,
      );
      if (!fp || !tp) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "wire mod");
      path.setAttribute("d", wirePath(fp.x, fp.y, tp.x, tp.y));
      this.wiresLayer.appendChild(path);
    }

    // Nodes
    for (const n of doc.nodes) {
      let factory;
      try {
        factory = this.registry.get(n.type);
      } catch {
        continue;
      }
      const [x, y] = pos.get(n.id) ?? [0, 0];
      const h = nodeHeight(factory);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.dataset.node = n.id;
      g.setAttribute("class", `node${selection === n.id ? " selected" : ""}`);
      g.setAttribute("transform", `translate(${x},${y})`);

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "node-body");
      rect.setAttribute("width", String(NODE_W));
      rect.setAttribute("height", String(h));
      g.appendChild(rect);

      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("class", "node-title");
      title.setAttribute("x", "10");
      title.setAttribute("y", "16");
      title.textContent = n.id;
      g.appendChild(title);

      const typ = document.createElementNS("http://www.w3.org/2000/svg", "text");
      typ.setAttribute("class", "node-type");
      typ.setAttribute("x", "10");
      typ.setAttribute("y", "28");
      typ.textContent = n.type;
      g.appendChild(typ);

      for (const p of layoutPorts(factory, [0, 0])) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("class", `port ${p.kind === "out" ? "out" : p.kind}`);
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
        c.setAttribute("r", "5");
        c.dataset.port = p.id;
        c.dataset.op = n.id;
        c.dataset.kind = p.kind;
        c.dataset.portType = p.portType;
        g.appendChild(c);
      }

      this.nodesLayer.appendChild(g);
    }
  }
}
