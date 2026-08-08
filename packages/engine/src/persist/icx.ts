/**
 * .icx pack / unpack — ZIP (fflate) with stable layout (§12.2).
 * Every pack path runs the §12.3 taint gate (blocking).
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sha256Hex } from "./hash.js";
import {
  createDefaultManifest,
  parseManifest,
  type Manifest,
} from "./manifest.js";
import {
  assertUntainted,
  type TaintGateOptions,
} from "./taintGate.js";

export class IcxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcxError";
  }
}

/** In-memory project tree for pack/unpack. */
export interface IcxProject {
  manifest: Manifest;
  /** graph.json body (object or already-validated GraphDocument). */
  graph: unknown;
  story?: unknown;
  provenance?: unknown;
  theme?: unknown;
  /**
   * Asset bytes keyed by stable path as stored in the zip
   * (e.g. "assets/seraph.bin" or "seraph.bin" under assets/).
   */
  assets: Array<{ path: string; bytes: Uint8Array }>;
  /** Optional cover image bytes (thumbnail.png). */
  thumbnail?: Uint8Array;
}

export interface PackIcxOptions extends TaintGateOptions {
  /** ZIP level 0–9; default 6. */
  level?: number;
}

function normalizeAssetZipPath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/^\//, "");
  if (p.startsWith("assets/")) return p;
  return `assets/${p}`;
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

/**
 * Ensure every asset has a sha256 in manifest; compute if missing.
 * Mutates a copy of manifest.assets.
 */
export async function ensureAssetHashes(
  project: IcxProject,
): Promise<Manifest> {
  const byPath = new Map(
    project.assets.map((a) => [normalizeAssetZipPath(a.path), a.bytes]),
  );
  const assets = [];
  for (const ref of project.manifest.assets ?? []) {
    const zipPath = normalizeAssetZipPath(ref.path);
    const bytes = byPath.get(zipPath);
    if (!bytes) {
      throw new IcxError(
        `manifest asset "${ref.path}" has no bytes in project.assets`,
      );
    }
    const sha256 = ref.sha256?.length ? ref.sha256 : await sha256Hex(bytes);
    assets.push({
      ...ref,
      path: ref.path.startsWith("assets/")
        ? ref.path
        : `assets/${ref.path.replace(/^assets\//, "")}`,
      sha256,
    });
  }
  // Assets present in project but not listed — add with hash
  for (const [zipPath, bytes] of byPath) {
    const display = zipPath.startsWith("assets/")
      ? zipPath
      : `assets/${zipPath}`;
    if (!assets.some((a) => normalizeAssetZipPath(a.path) === zipPath)) {
      assets.push({
        path: display,
        sha256: await sha256Hex(bytes),
      });
    }
  }
  return parseManifest({ ...project.manifest, assets });
}

/**
 * Pack a project into .icx bytes. Runs taint gate on all JSON payloads.
 * Binary zip members are not string-scanned (§12.3).
 */
export async function packIcx(
  project: IcxProject,
  opts: PackIcxOptions = {},
): Promise<Uint8Array> {
  const manifest = await ensureAssetHashes(project);
  const graph = project.graph;
  const story = project.story ?? { schemaVersion: 1, stations: [] };
  const provenance = project.provenance ?? { schemaVersion: 1, records: [] };
  const theme = project.theme ?? { schemaVersion: 1 };

  // Taint-gate all serializable JSON (§12.3) — blocking.
  const gateOpts = {
    vaultSecrets: opts.vaultSecrets,
    extraPatterns: opts.extraPatterns,
  };
  assertUntainted(manifest, gateOpts, "manifest.json");
  assertUntainted(graph, gateOpts, "graph.json");
  assertUntainted(story, gateOpts, "story.json");
  assertUntainted(provenance, gateOpts, "provenance.json");
  assertUntainted(theme, gateOpts, "theme.json");

  const files: Record<string, Uint8Array> = {
    "manifest.json": jsonBytes(manifest),
    "graph.json": jsonBytes(graph),
    "story.json": jsonBytes(story),
    "provenance.json": jsonBytes(provenance),
    "theme.json": jsonBytes(theme),
  };

  for (const asset of project.assets) {
    const zipPath = normalizeAssetZipPath(asset.path);
    files[zipPath] = asset.bytes;
  }

  if (project.thumbnail) {
    files["thumbnail.png"] = project.thumbnail;
  }

  try {
    const level = (opts.level ?? 6) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    return zipSync(files, { level });
  } catch (err) {
    throw new IcxError(
      `zip failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Unpack .icx bytes into an in-memory project. Validates manifest schema.
 * Does not re-run taint on unpack (authoring may inspect; re-pack gates).
 */
export function unpackIcx(bytes: Uint8Array): IcxProject {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    throw new IcxError(
      `unzip failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const readJson = (name: string, required: boolean): unknown => {
    const raw = entries[name];
    if (!raw) {
      if (required) throw new IcxError(`missing ${name} in .icx`);
      return undefined;
    }
    try {
      return JSON.parse(strFromU8(raw)) as unknown;
    } catch {
      throw new IcxError(`invalid JSON in ${name}`);
    }
  };

  const manifest = parseManifest(readJson("manifest.json", true));
  const graph = readJson("graph.json", true);
  const story = readJson("story.json", false);
  const provenance = readJson("provenance.json", false);
  const theme = readJson("theme.json", false);

  const assets: IcxProject["assets"] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith("assets/") && !path.endsWith("/")) {
      assets.push({ path, bytes: data });
    }
  }

  const thumbnail = entries["thumbnail.png"];

  return {
    manifest,
    graph,
    story,
    provenance,
    theme,
    assets,
    thumbnail,
  };
}

/**
 * Verify asset bytes match manifest sha256 entries.
 * Returns list of mismatch paths (empty if ok).
 */
export async function verifyIcxAssetHashes(
  project: IcxProject,
): Promise<string[]> {
  const mismatches: string[] = [];
  const byPath = new Map(
    project.assets.map((a) => [normalizeAssetZipPath(a.path), a.bytes]),
  );
  for (const ref of project.manifest.assets ?? []) {
    const bytes = byPath.get(normalizeAssetZipPath(ref.path));
    if (!bytes) {
      mismatches.push(ref.path);
      continue;
    }
    const actual = await sha256Hex(bytes);
    if (actual.toLowerCase() !== ref.sha256.toLowerCase()) {
      mismatches.push(ref.path);
    }
  }
  return mismatches;
}

export { createDefaultManifest, parseManifest };
export type { Manifest };
