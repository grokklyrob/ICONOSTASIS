/**
 * Zod validators for graph.json schemaVersion 1 (§12.2, AMD-14).
 * Unknown fields preserved via .passthrough() on every object level.
 */

import { z } from "zod";

const portRefSchema = z
  .object({
    opId: z.string().min(1),
    port: z.string().min(1),
  })
  .passthrough();

const paramRefSchema = z
  .object({
    opId: z.string().min(1),
    param: z.string().min(1),
  })
  .passthrough();

const modulationMapSchema = z.object({
  in: z.tuple([z.number(), z.number()]),
  out: z.tuple([z.number(), z.number()]),
});

/** Appendix B per-node sugar entry (normalized away on load). */
const nodeModulationSugarSchema = z
  .object({
    param: z.string().min(1),
    from: z.string().min(1), // "opId.port" or "opId.port[index]" — M0: "opId.port"
    map: modulationMapSchema.optional(),
  })
  .passthrough();

const wireEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: portRefSchema,
    to: portRefSchema,
  })
  .passthrough();

const modulationEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: portRefSchema,
    to: paramRefSchema,
    map: modulationMapSchema.optional(),
  })
  .passthrough();

const paramValueSchema = z.union([z.number(), z.boolean(), z.string()]);

const graphNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    params: z.record(paramValueSchema).default({}),
    position: z.tuple([z.number(), z.number()]).optional(),
    /** Appendix B sugar — accepted on read, stripped after normalize. */
    modulations: z.array(nodeModulationSugarSchema).optional(),
  })
  .passthrough();

/**
 * Loose document schema before sugar normalization.
 * `modulations` may be absent when only per-node sugar is used.
 */
export const graphDocumentInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(graphNodeSchema),
    wires: z.array(wireEdgeSchema).default([]),
    modulations: z.array(modulationEdgeSchema).default([]),
  })
  .passthrough();

export type GraphDocumentInput = z.infer<typeof graphDocumentInputSchema>;

export {
  portRefSchema,
  paramRefSchema,
  wireEdgeSchema,
  modulationEdgeSchema,
  graphNodeSchema,
  modulationMapSchema,
  nodeModulationSugarSchema,
};
