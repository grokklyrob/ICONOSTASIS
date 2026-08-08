/**
 * Layout helpers for graph nodes (ports + box size).
 */

import type { OperatorFactory } from "@iconostasis/engine";

export const NODE_W = 168;
export const NODE_H_BASE = 48;
export const PORT_R = 5;
export const PORT_GAP = 16;

export function nodeHeight(factory: OperatorFactory): number {
  const n = Math.max(
    factory.inputs.length + factory.params.filter((p) => p.modulatable).length,
    factory.outputs.length,
    1,
  );
  return NODE_H_BASE + n * PORT_GAP;
}

export function inputPortY(index: number): number {
  return 28 + index * PORT_GAP;
}

export function outputPortY(index: number): number {
  return 28 + index * PORT_GAP;
}

export interface PortGeom {
  kind: "in" | "out" | "param";
  id: string;
  portType: string;
  x: number;
  y: number;
}

export function layoutPorts(
  factory: OperatorFactory,
  origin: [number, number],
): PortGeom[] {
  const [ox, oy] = origin;
  const ports: PortGeom[] = [];
  factory.inputs.forEach((p, i) => {
    ports.push({
      kind: "in",
      id: p.id,
      portType: p.type,
      x: ox,
      y: oy + inputPortY(i),
    });
  });
  // Modulatable params as param inlets (modulation targets)
  const mods = factory.params.filter((p) => p.modulatable);
  mods.forEach((p, i) => {
    ports.push({
      kind: "param",
      id: p.id,
      portType: "signal",
      x: ox,
      y: oy + inputPortY(factory.inputs.length + i),
    });
  });
  factory.outputs.forEach((p, i) => {
    ports.push({
      kind: "out",
      id: p.id,
      portType: p.type,
      x: ox + NODE_W,
      y: oy + outputPortY(i),
    });
  });
  return ports;
}

export function wirePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
