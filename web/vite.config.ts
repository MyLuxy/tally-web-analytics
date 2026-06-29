import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard talks to the Tally server during development through this
// proxy, so the browser only ever sees one origin and we dodge CORS locally.
export default defineConfig({
  plugins: [react()],
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
