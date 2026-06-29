import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard talks to the Tally server during development through this
// proxy, so the browser only ever sees one origin and we dodge CORS locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
