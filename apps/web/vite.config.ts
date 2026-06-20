/**
 * Vite config. Add the Tailwind v4 plugin in Chunk 5 (`@tailwindcss/vite`).
 * Proxy /api and /ws to the FastAPI backend during dev so the app talks to localhost:8000.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";  // add in Chunk 5

export default defineConfig({
  plugins: [react() /*, tailwindcss() */],
  server: {
    port: 5173,
    proxy: {
      "/internal": { target: "http://localhost:8000", changeOrigin: true },
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "ws://localhost:8000", ws: true }
    }
  },
  build: {
    // Route-split the 3D scene into its own lazy chunk (budget < 700KB gzipped — DESIGN_SYSTEM.md).
    // React.lazy(() => import("./features/maps3d/...")) handles this; keep an eye on chunk sizes.
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] }
});
