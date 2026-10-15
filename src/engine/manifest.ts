// The engine's manifest (public/engine/manifest.json, written by scripts/copy-engine.mjs).

export type Manifest = {
  /** Changes whenever any engine file (or the harness) changes; names the Cache Storage entry. */
  version: string;
  pyodide: string;
  /** The Python version Pyodide runs, such as 3.14.2. */
  python: string;
  /** Each file's size in bytes. */
  files: Record<string, number>;
  /** The size of each file's .gz copy, for the files that have one. */
  gzip: Record<string, number>;
  /** Every file, in download order. */
  order: string[];
};

export const CACHE_PREFIX = "python-arena-engine-";

/** Bytes to download for one file (its .gz copy when there is one). */
export const downloadSize = (m: Manifest, name: string) => m.gzip[name] ?? m.files[name] ?? 0;

/** The manifest, or null when it can't be loaded (offline before the first visit, for example). */
export async function fetchManifest(url: string): Promise<Manifest | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Manifest;
  } catch {
    // Offline: the copy saved with the engine, if there is one.
    try {
      for (const key of await caches.keys()) {
        if (!key.startsWith(CACHE_PREFIX)) continue;
        const saved = await (await caches.open(key)).match(url);
        if (saved) return (await saved.json()) as Manifest;
      }
    } catch {
      /* no Cache Storage */
    }
    return null;
  }
}
