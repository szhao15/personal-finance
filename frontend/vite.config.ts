import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser calls /api/...; Vite forwards it to the backend, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
