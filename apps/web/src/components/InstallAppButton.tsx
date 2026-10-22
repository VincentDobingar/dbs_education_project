import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { promptInstall, useInstallMode } from "../lib/pwaInstall.js";

interface InstallAppButtonProps {
  /** Classes du bouton : chaque emplacement (menu, pied de page, barre latérale) a son style. */
  className: string;
}

function DownloadIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

function ShareIcon(): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline h-4 w-4 align-[-2px]"
      aria-hidden="true"
    >
      <path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function IosInstructions({ onClose }: { onClose: () => void }): ReactNode {
  const { t } = useTranslation("app");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className="w-full max-w-sm rounded-xl bg-white p-6 text-slate-700 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl border border-slate-200" />
          <h2 id="ios-install-title" className="text-lg font-semibold text-brand-night">
            {t("pwa.ios.title")}
          </h2>
        </div>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm">
          <li>
            {t("pwa.ios.step1")} <ShareIcon />
          </li>
          <li>{t("pwa.ios.step2")}</li>
          <li>{t("pwa.ios.step3")}</li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">{t("pwa.ios.safariOnly")}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-md bg-brand-night px-4 py-2 text-sm font-medium text-white"
        >
          {t("pwa.ios.close")}
        </button>
      </div>
    </div>
  );
}

/**
 * « Installer l'application » : invite native sur Android et ordinateur, mode
 * d'emploi sur iPhone/iPad, rien du tout si l'application est déjà installée ou
 * si le navigateur ne sait pas l'installer.
 */
export function InstallAppButton({ className }: InstallAppButtonProps): ReactNode {
  const { t } = useTranslation("app");
  const mode = useInstallMode();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (mode === "none" && !showIosHelp) {
    return null;
  }

  return (
    <>
      {mode === "none" ? null : (
        <button
          type="button"
          className={className}
          onClick={() => {
            if (mode === "ios") {
              setShowIosHelp(true);
            } else {
              void promptInstall();
            }
          }}
        >
          <DownloadIcon />
          {t("pwa.install")}
        </button>
      )}
      {showIosHelp ? <IosInstructions onClose={() => setShowIosHelp(false)} /> : null}
    </>
  );
}
