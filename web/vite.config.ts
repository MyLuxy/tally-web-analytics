import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // override with VITE_BASE=/analytics/ if mounted under a sub-path, see web/src/api.ts
  base: process.env.VITE_BASE ?? "/",
  build: {
    outDir: "../server/web-dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
