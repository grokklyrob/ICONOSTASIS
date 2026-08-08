/**
 * Graph document types. Canonical write shape (AMD-14):
 * top-level wires[] + modulations[] as first-class edges.
 * Appendix B per-node modulations sugar is accepted on read (Step 5).
 */

import type { ParamValue } from "../types/params.js";

export interface PortRef {
  opId: string;
  port: string;
}

export interface ParamRef {
  opId: string;
  param: string;
}

export interface WireEdge {
  id: string;
  from: PortRef;
  to: PortRef;
  /** Forward-compat unknown fields preserved on round-trip (§12.2). */
  [key: string]: unknown;
}

export interface ModulationMap {
  in: [number, number];
  out: [number, number];
}

/** First-class modulation edge: signal output → modulatable param (AMD-14). */
export interface ModulationEdge {
  id: string;
  from: PortRef;
  to: ParamRef;
  map?: ModulationMap;
  /** Forward-compat unknown fields preserved on round-trip (§12.2). */
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: string;
  params: Record<string, ParamValue>;
  position?: [number, number];
  /** Forward-compat unknown fields preserved on round-trip (§12.2). */
  [key: string]: unknown;
}

export interface GraphDocument {
  schemaVersion: 1;
  nodes: GraphNode[];
  wires: WireEdge[];
  /** First-class edge list — canonical write shape (AMD-14). */
  modulations: ModulationEdge[];
  /** Forward-compat unknown fields preserved on round-trip (§12.2). */
  [key: string]: unknown;
}
