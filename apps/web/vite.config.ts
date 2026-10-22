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
      workbox: {
        // SPA sous BrowserRouter : un lien profond (/portail/parent, /portail/eleve,
        // ...) rechargé hors-ligne doit retomber sur l'app shell, jamais un 404 du SW.
        navigateFallback: "/index.html",
        // Un fichier (PDF du guide…) ouvert par un lien est aussi une requête de
        // navigation : sans cette exclusion, le SW servait index.html à sa place.
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[a-z0-9]+$/i],
        runtimeCaching: [
          // Lecture hors-ligne des portails parent/élève (zones à couverture réseau
          // intermittente) : uniquement les GET, jamais /auth/* ni une mutation —
          // NetworkFirst retourne le cache seulement si le réseau échoue/est lent,
          // donc les données restent fraîches dès que la connexion revient.
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              (url.pathname.includes("/parent-portal/") || url.pathname.includes("/student-portal/")),
            handler: "NetworkFirst",
            options: {
              cacheName: "portal-api-cache",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
