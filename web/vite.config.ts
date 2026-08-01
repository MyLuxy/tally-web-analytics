import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard talks to the Tally server during development through this
// proxy, so the browser only ever sees one origin and we dodge CORS locally.
export default defineConfig({
  plugins: [react()],
  // Lets the built dashboard be reverse-proxied under a sub-path on someone
  // else's domain (e.g. /analytics/) instead of always living at a root --
  // affects both emitted asset URLs in index.html and import.meta.env.BASE_URL
  // at runtime (see web/src/api.ts). Defaults to root so nothing changes for
  // a standalone/subdomain deployment; override at build time with
  // `VITE_BASE=/analytics/ npm run build` when mounting under a sub-path.
  base: process.env.VITE_BASE ?? "/",
  // Build straight into the server so it can serve the dashboard in production
  // without a second process. Path is relative to this file (web/).
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
