// Whether this browser can run Python (Pyodide): WebAssembly, module workers and Cache Storage.

let cached: boolean | null = null;

export function engineSupported(): boolean {
  if (cached !== null) return cached;
  try {
    cached = typeof WebAssembly === "object" && typeof WebAssembly.instantiateStreaming === "function" && typeof Worker === "function" && typeof caches === "object" && typeof BigInt === "function";
  } catch {
    cached = false;
  }
  return cached;
}
