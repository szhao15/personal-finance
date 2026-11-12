import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser calls /api/...; Vite forwards it to the backend, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    // Docker on macOS can miss file-change events from mounted folders; poll instead when told to.
    watch: process.env.WATCH_POLLING ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
