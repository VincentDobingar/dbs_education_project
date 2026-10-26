import { Toast } from "@edumanage/ui";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
// vite-plugin-pwa's React hook: wraps workbox's register/update/offline-ready
// callbacks so the UI can surface them instead of leaving autoUpdate silent.
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Zones à couverture réseau intermittente : affiche un bandeau quand le
 * navigateur se déclare hors-ligne (les pages portail parent/élève restent
 * consultables grâce au cache runtime configuré dans vite.config.ts), et un
 * toast ponctuel quand l'app est prête hors-ligne ou qu'une mise à jour attend.
 * Monté une seule fois à la racine (App.tsx) plutôt que par page.
 */
export function PwaStatus(): ReactNode {
  const { t } = useTranslation("app");
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Le navigateur ne cherche un nouveau service worker qu'à une navigation
    // complète : une SPA restée ouverte (ou installée) gardait l'ancienne version
    // pendant des heures après un déploiement. On vérifie donc toutes les 30 min
    // et à chaque retour sur l'onglet ; autoUpdate recharge alors la page.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }
      const checkForUpdate = (): void => {
        if (navigator.onLine) {
          void registration.update().catch(() => undefined);
        }
      };
      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          checkForUpdate();
        }
      });
    },
  });

  useEffect(() => {
    // Ancien cache partagé des API parent/élève : il pouvait survivre à une
    // déconnexion ou à l'expiration d'une couverture. Le portail parent est
    // désormais réseau uniquement pour revérifier les droits à chaque accès.
    const purgeLegacyPortalCache = (): void => {
      if ("caches" in window) void caches.delete("portal-api-cache").catch(() => undefined);
    };
    purgeLegacyPortalCache();
    navigator.serviceWorker?.addEventListener("controllerchange", purgeLegacyPortalCache);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", purgeLegacyPortalCache);
  }, []);

  useEffect(() => {
    function handleOnline(): void {
      setIsOffline(false);
    }
    function handleOffline(): void {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <>
      {isOffline && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950"
        >
          {t("pwa.offlineBanner")}
        </div>
      )}

      {offlineReady && (
        <Toast message={t("pwa.offlineReady")} variant="success" onDismiss={() => setOfflineReady(false)} />
      )}

      {needRefresh && (
        <Toast
          message={
            <span className="flex items-center gap-3">
              {t("pwa.updateAvailable")}
              <button
                type="button"
                onClick={() => void updateServiceWorker(true)}
                className="underline underline-offset-2"
              >
                {t("pwa.update.reload")}
              </button>
            </span>
          }
          variant="success"
          durationMs={0}
          onDismiss={() => setNeedRefresh(false)}
        />
      )}
    </>
  );
}
