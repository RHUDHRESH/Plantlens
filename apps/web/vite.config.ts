/**
 * Vite config. Tailwind v4 via `@tailwindcss/vite`.
 * Proxy /api and /ws to the FastAPI backend during dev. Defaults to localhost:8000;
 * set PLANTLENS_API_URL (e.g. in apps/web/.env.local) to point at a different backend
 * when port 8000 is taken or the API runs on another host.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiTarget = env.PLANTLENS_API_URL || "http://localhost:8000";
  const wsTarget = apiTarget.replace(/^http/, "ws");

  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    // Default stays 5173; PORT lets a harness or a second checkout run without a clash.
    port: Number(env.PORT) || 5173,
    proxy: {
      "/internal": { target: apiTarget, changeOrigin: true },
      "/api": { target: apiTarget, changeOrigin: true, ws: true },
      "/ws": { target: wsTarget, ws: true }
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
  };
});
