/**
 * manifest.json for .icx bundles (§12.2, Appendix B illustrative).
 */

import { z } from "zod";

export const manifestAssetSchema = z
  .object({
    path: z.string().min(1),
    /** May be empty before pack; packIcx fills via content hash (§12.2). */
    sha256: z.string().default(""),
    type: z.string().optional(),
    points: z.number().optional(),
  })
  .passthrough();

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().optional(),
    title: z.string().optional(),
    author: z
      .object({
        name: z.string().optional(),
        npub: z.string().optional(),
        mark: z.string().optional(),
      })
      .passthrough()
      .optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    created: z.string().optional(),
    modified: z.string().optional(),
    engine: z
      .object({ min: z.string().optional() })
      .passthrough()
      .optional(),
    tiers: z
      .object({
        authoredOn: z.string().optional(),
        verified: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    entry: z
      .object({
        graph: z.string().default("graph.json"),
        story: z.string().optional(),
        theme: z.string().optional(),
      })
      .passthrough()
      .optional(),
    assets: z.array(manifestAssetSchema).default([]),
    provenance: z.string().optional(),
    thumbnail: z.string().optional(),
  })
  .passthrough();

export type ManifestAsset = z.infer<typeof manifestAssetSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export function parseManifest(raw: unknown): Manifest {
  return manifestSchema.parse(raw);
}

export function createDefaultManifest(
  partial: Partial<Manifest> = {},
): Manifest {
  return parseManifest({
    title: "Untitled",
    entry: {
      graph: "graph.json",
      story: "story.json",
      theme: "theme.json",
    },
    assets: [],
    ...partial,
    schemaVersion: 1,
  });
}
