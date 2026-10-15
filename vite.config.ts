import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import proTrack from "./scripts/pro-track/vite-plugin.mjs";

// Pages live at real paths so each can be indexed. CI sets BASE_PATH to /<repo>/ when publishing
// to a github.io project page. Python itself (Pyodide) isn't bundled: the run worker downloads it
// from public/engine (scripts/copy-engine.mjs) and keeps it in Cache Storage.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), proTrack(__dirname)],
  worker: { format: "es" },
  // The harness (src/engine/arena.py) is imported as text with ?raw.
  assetsInclude: [],
  build: {
    target: "es2022",
    // The lesson page's chunk holds the code editor (CodeMirror), about 530 kB before compression.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  server: { fs: { allow: ["."] } },
});
