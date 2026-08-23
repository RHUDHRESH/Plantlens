/**
 * Vite config. Tailwind v4 via `@tailwindcss/vite`.
 * Proxy /api and /ws to the FastAPI backend during dev so the app talks to localhost:8000.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/internal": { target: "http://localhost:8000", changeOrigin: true },
      "/api": { target: "http://localhost:8000", changeOrigin: true, ws: true },
      "/ws": { target: "ws://localhost:8000", ws: true }
    }
  },
  build: {
    // Route-split the 3D scene into its own lazy chunk (budget < 700KB gzipped — DESIGN_SYSTEM.md).
    // React.lazy(() => import("./features/maps3d/...")) handles the async boundary; manualChunks
    // keeps heavy vendor/feature graphs out of the main index (see scripts/check-chunk-budgets.mjs).
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, "/");
          if (norm.includes("/node_modules/")) {
            if (
              norm.includes("/three/") ||
              norm.includes("/three-stdlib/") ||
              norm.includes("/@react-three/")
            ) {
              return "three";
            }
            if (norm.includes("/@xyflow/")) {
              return "xyflow";
            }
            return undefined;
          }
          if (
            norm.includes("/features/studio-forms/") ||
            norm.includes("/features/studio-graph/") ||
            norm.includes("/features/studio-launchpad/")
          ) {
            return "studio";
          }
          if (
            norm.includes("/features/agents/") ||
            norm.includes("/features/copilot/")
          ) {
            return "agents";
          }
          if (norm.includes("/features/scenarios/")) {
            return "scenarios";
          }
          if (norm.includes("/features/maps3d/")) {
            return "PlantMap3D";
          }
          return undefined;
        },
      },
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] }
});
