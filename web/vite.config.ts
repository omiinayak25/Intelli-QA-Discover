import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on :3000; API requests proxy to the backend on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { "/api": "http://localhost:4000" },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
