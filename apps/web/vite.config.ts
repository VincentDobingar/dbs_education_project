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
        id: "/",
        name: "Digital Business Services Africa School",
        short_name: "DBS School",
        description:
          "Plateforme de gestion des établissements d'enseignement en Afrique : élèves, notes, présences, finances et portail des familles.",
        lang: "fr",
        dir: "ltr",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["education", "productivity"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Appui long sur l'icône (Android, ordinateur) : accès direct aux espaces.
        shortcuts: [
          {
            name: "Portail famille",
            short_name: "Famille",
            url: "/portail/connexion",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Espace établissement",
            short_name: "Établissement",
            url: "/connexion",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Guide d'utilisation",
            short_name: "Guide",
            url: "/guide",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
        // Captures affichées par Android dans la fenêtre d'installation.
        screenshots: [
          {
            src: "/screenshots/accueil.webp",
            sizes: "824x1830",
            type: "image/webp",
            form_factor: "narrow",
            label: "Accueil",
          },
          {
            src: "/screenshots/portail.webp",
            sizes: "824x1830",
            type: "image/webp",
            form_factor: "narrow",
            label: "Portail famille et élève",
          },
          {
            src: "/screenshots/guide.webp",
            sizes: "824x1830",
            type: "image/webp",
            form_factor: "narrow",
            label: "Guide d'utilisation",
          },
        ],
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
