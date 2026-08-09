/**
 * provenance.json records (§12.4).
 * Append-only; no key material ever.
 */

import { z } from "zod";

export const provenanceRecordSchema = z
  .object({
    artifactHash: z.string().min(1),
    capability: z.string().min(1),
    providerClass: z.string().min(1),
    modelId: z.string().optional(),
    promptHash: z.string().min(1),
    /** Authoring default on; publish toggle separate (default off). */
    promptText: z.string().optional(),
    params: z.record(z.unknown()).default({}),
    seed: z.number().optional(),
    nondeterministic: z.boolean().optional(),
    createdAt: z.string().min(1),
    opId: z.string().optional(),
  })
  .passthrough();

export const provenanceDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    records: z.array(provenanceRecordSchema).default([]),
  })
  .passthrough();

export type ProvenanceRecord = z.infer<typeof provenanceRecordSchema>;
export type ProvenanceDoc = z.infer<typeof provenanceDocSchema>;

export function createEmptyProvenance(): ProvenanceDoc {
  return { schemaVersion: 1, records: [] };
}

export function parseProvenance(raw: unknown): ProvenanceDoc {
  return provenanceDocSchema.parse(raw);
}

export function appendProvenance(
  doc: ProvenanceDoc,
  record: ProvenanceRecord,
): ProvenanceDoc {
  return {
    ...doc,
    schemaVersion: 1,
    records: [...doc.records, provenanceRecordSchema.parse(record)],
  };
}
