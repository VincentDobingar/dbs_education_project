import { Toast } from "@edumanage/ui";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
// vite-plugin-pwa's React hook: wraps workbox's register/update/offline-ready
// callbacks so the UI can surface them instead of leaving autoUpdate silent.
import { useRegisterSW } from "virtual:pwa-register/react";

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
  } = useRegisterSW();

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
