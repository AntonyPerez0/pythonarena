// The images a challenge puts in the program's folder (content/assets, published at images/): fetched
// once, then kept for the page's lifetime. The service worker keeps them for offline use too.

const loaded = new Map<string, Promise<Uint8Array>>();

/** The address of one of the site's images. */
export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}images/${name}`;

function fetchAsset(name: string): Promise<Uint8Array> {
  let p = loaded.get(name);
  if (!p) {
    p = fetch(assetUrl(name)).then(async (res) => {
      if (!res.ok) throw new Error(`couldn't load the image ${name} (HTTP ${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    });
    loaded.set(name, p);
    // A failed load is tried again next time.
    p.catch(() => loaded.delete(name));
  }
  return p;
}

/** The images as files for a run: name to bytes. */
export async function assetFiles(names: string[] | undefined): Promise<Record<string, Uint8Array>> {
  if (!names?.length) return {};
  const data = await Promise.all(names.map(fetchAsset));
  return Object.fromEntries(names.map((n, i) => [n, data[i]]));
}
