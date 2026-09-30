import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Este proxy es SOLO para `npm run dev` fuera de Docker. Dentro del
    // contenedor, el mismo rol lo cumple nginx (ver nginx/templates/).
    // El objetivo es que la invariante "el frontend nunca conoce la URL del
    // backend, solo pide /api/... a su propio origen" valga también en dev.
    // 3001 es el puerto de depuración que reservas-api publica en el host.
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
