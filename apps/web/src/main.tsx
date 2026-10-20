import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./i18n.js";
import "./index.css";

// Après un nouveau déploiement, un onglet (ou le cache PWA) qui exécute encore
// l'ancien bundle demande des chunks dont le nom haché n'existe plus — le chargement
// paresseux d'une page échoue alors (« error loading dynamically imported module »).
// Vite signale ce cas via `vite:preloadError` : on recharge une fois pour récupérer
// la version courante, avec un garde-fou pour ne jamais boucler si le chunk manque
// réellement.
const RELOAD_GUARD_KEY = "edumanage:chunk-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  let lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  } catch {
    // stockage indisponible : on tente quand même un rechargement unique
  }
  if (Date.now() - lastReload < 10_000) return;
  event.preventDefault();
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // idem
  }
  window.location.reload();
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
