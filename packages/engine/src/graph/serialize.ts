/**
 * graph.json serialize / deserialize (§12.2, AMD-14).
 *
 * Canonical write shape: top-level wires[] + modulations[].
 * Appendix B per-node modulations sugar is accepted on read and normalized
 * into the first-class edge list.
 */

import type { JsonValue } from "../types/operator.js";
import type { ParamValue } from "../types/params.js";
import { assertAcyclic } from "./topology.js";
import {
  graphDocumentInputSchema,
  type GraphDocumentInput,
} from "./schema.js";
import type {
  GraphDocument,
  GraphNode,
  ModulationEdge,
  WireEdge,
} from "./types.js";

export class GraphSerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphSerializeError";
  }
}

/** Parse "opId.port" into a port ref. */
export function parseFromRef(from: string): { opId: string; port: string } {
  const dot = from.indexOf(".");
  if (dot <= 0 || dot === from.length - 1) {
    throw new GraphSerializeError(
      `Invalid modulation from ref "${from}" (expected opId.port)`,
    );
  }
  // Strip optional band[0] style suffix for M0 — take port token before '['.
  const opId = from.slice(0, dot);
  let port = from.slice(dot + 1);
  const bracket = port.indexOf("[");
  if (bracket >= 0) port = port.slice(0, bracket);
  if (!opId || !port) {
    throw new GraphSerializeError(`Invalid modulation from ref "${from}"`);
  }
  return { opId, port };
}

/**
 * Lift Appendix B per-node modulations sugar into top-level first-class edges.
 * Removes `modulations` from nodes after lift (canonical model is top-level).
 */
export function normalizeModulations(input: GraphDocumentInput): {
  nodes: GraphNode[];
  modulations: ModulationEdge[];
} {
  const modulations: ModulationEdge[] = [...(input.modulations ?? [])].map(
    (m) => ({ ...m }),
  );
  const nodes: GraphNode[] = [];

  for (const node of input.nodes) {
    const { modulations: sugar, ...rest } = node as GraphNode & {
      modulations?: Array<{
        param: string;
        from: string;
        map?: { in: [number, number]; out: [number, number] };
        [key: string]: unknown;
      }>;
    };

    if (sugar && sugar.length > 0) {
      for (let i = 0; i < sugar.length; i++) {
        const entry = sugar[i]!;
        const from = parseFromRef(entry.from);
        const id =
          typeof entry["id"] === "string" && entry["id"].length > 0
            ? (entry["id"] as string)
            : `mod_${node.id}_${entry.param}_${i}`;
        const edge: ModulationEdge = {
          id,
          from,
          to: { opId: node.id, param: entry.param },
        };
        if (entry.map) edge.map = entry.map;
        // Preserve unknown sugar fields (§12.2), skip sugar-only keys.
        for (const [k, v] of Object.entries(entry)) {
          if (
            k === "param" ||
            k === "from" ||
            k === "map" ||
            k === "id" ||
            k === "to"
          ) {
            continue;
          }
          edge[k] = v;
        }
        modulations.push(edge);
      }
    }

    const cleaned: GraphNode = {
      ...rest,
      id: rest.id,
      type: rest.type,
      params: { ...(rest.params as Record<string, ParamValue>) },
    };
    // Ensure sugar key is not re-emitted.
    delete cleaned["modulations"];
    nodes.push(cleaned);
  }

  return { nodes, modulations };
}

function validateRefs(doc: GraphDocument): void {
  const ids = new Set(doc.nodes.map((n) => n.id));

  for (const n of doc.nodes) {
    if (!n.id) throw new GraphSerializeError("Node missing id");
  }
  if (ids.size !== doc.nodes.length) {
    throw new GraphSerializeError("Duplicate node id in graph document");
  }

  for (const w of doc.wires) {
    if (!ids.has(w.from.opId)) {
      throw new GraphSerializeError(
        `Wire "${w.id}" references unknown op "${w.from.opId}"`,
      );
    }
    if (!ids.has(w.to.opId)) {
      throw new GraphSerializeError(
        `Wire "${w.id}" references unknown op "${w.to.opId}"`,
      );
    }
  }

  for (const m of doc.modulations) {
    if (!ids.has(m.from.opId)) {
      throw new GraphSerializeError(
        `Modulation "${m.id}" references unknown op "${m.from.opId}"`,
      );
    }
    if (!ids.has(m.to.opId)) {
      throw new GraphSerializeError(
        `Modulation "${m.id}" references unknown op "${m.to.opId}"`,
      );
    }
  }

  assertAcyclic(doc);
}

/**
 * Deserialize unknown JSON into a canonical GraphDocument.
 * Preserves unknown fields; normalizes per-node modulation sugar (AMD-14).
 */
export function deserializeGraph(input: unknown): GraphDocument {
  const parsed = graphDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new GraphSerializeError(
      `Invalid graph.json: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const data = parsed.data;
  const { nodes, modulations } = normalizeModulations(data);

  // Preserve top-level unknown keys (§12.2).
  const {
    schemaVersion: _sv,
    nodes: _n,
    wires: _w,
    modulations: _m,
    ...unknownRoot
  } = data;

  const doc: GraphDocument = {
    ...unknownRoot,
    schemaVersion: 1,
    nodes,
    wires: (data.wires as WireEdge[]).map((w) => ({ ...w })),
    modulations,
  };

  validateRefs(doc);
  return doc;
}

/**
 * Serialize to a plain JSON-ready object (canonical write shape).
 * Does not emit per-node modulations sugar.
 */
export function serializeGraph(doc: GraphDocument): Record<string, unknown> {
  if (doc.schemaVersion !== 1) {
    throw new GraphSerializeError(
      `Cannot serialize schemaVersion ${String(doc.schemaVersion)}; M0 writes 1`,
    );
  }

  const {
    schemaVersion,
    nodes,
    wires,
    modulations,
    ...unknownRoot
  } = doc;

  return {
    ...unknownRoot,
    schemaVersion,
    nodes: nodes.map((n) => {
      const { modulations: _drop, ...rest } = n as GraphNode & {
        modulations?: unknown;
      };
      return {
        ...rest,
        id: rest.id,
        type: rest.type,
        params: { ...rest.params },
      };
    }),
    wires: wires.map((w) => ({ ...w })),
    modulations: modulations.map((m) => ({ ...m })),
  };
}

export function graphToJson(doc: GraphDocument, space = 2): string {
  return JSON.stringify(serializeGraph(doc), null, space);
}

export function graphFromJson(text: string): GraphDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e) {
    throw new GraphSerializeError(
      `graph.json parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return deserializeGraph(raw);
}

/** Deep equality helper for tests — compares serializeGraph outputs. */
export function graphsSemanticallyEqual(a: GraphDocument, b: GraphDocument): boolean {
  return (
    JSON.stringify(serializeGraph(a)) === JSON.stringify(serializeGraph(b))
  );
}

/** Type guard for JSON tree. */
export function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
