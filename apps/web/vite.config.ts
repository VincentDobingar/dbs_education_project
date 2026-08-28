import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Digital Business Services Africa School",
        short_name: "DBS Africa School",
        description: "Plateforme SaaS de gestion des établissements d'enseignement en Afrique",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/favicon-512.png", sizes: "512x512", type: "image/png" }],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
