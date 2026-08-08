/**
 * Asset fetch for GEO/PointCloud.
 * Vite publicDir is repo `assets/`, so `assets/seraph.bin` → `/seraph.bin`.
 */

export async function loadAsset(path: string): Promise<ArrayBuffer> {
  const url = toPublicUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadAsset failed: ${path} → ${url} (${res.status})`);
  }
  return res.arrayBuffer();
}

export function toPublicUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return path;
  // Strip leading assets/ when publicDir root is the assets folder.
  if (path.startsWith("assets/")) return `/${path.slice("assets/".length)}`;
  return `/${path}`;
}
