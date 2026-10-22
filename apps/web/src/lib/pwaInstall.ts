import { useSyncExternalStore } from "react";

/**
 * Installation de l'application web (PWA).
 *
 * - Chrome / Edge / Samsung Internet émettent `beforeinstallprompt` : on garde
 *   l'événement pour proposer notre propre bouton « Installer l'application ».
 *   L'événement peut arriver avant le premier rendu React, d'où l'écoute dès
 *   l'import de ce module (importé par main.tsx).
 * - Safari iOS n'a pas d'invite d'installation : on affiche le mode d'emploi
 *   (Partager → Sur l'écran d'accueil).
 * - Déjà installée (affichage autonome) : rien à proposer.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "prompt" | "ios" | "none";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function isIos(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints): boolean {
  // iPadOS se présente comme un Mac : on le reconnaît à son écran tactile.
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function getInstallMode(): InstallMode {
  if (installed || isStandalone()) {
    return "none";
  }
  if (deferredPrompt) {
    return "prompt";
  }
  return isIos() ? "ios" : "none";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ouvre l'invite d'installation du navigateur ; renvoie true si l'utilisateur accepte. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) {
    return false;
  }
  // Une invite ne peut servir qu'une fois.
  deferredPrompt = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getInstallMode, () => "none");
}

/** Tests uniquement : remet l'état d'installation à zéro. */
export function resetInstallStateForTests(): void {
  deferredPrompt = null;
  installed = false;
  notify();
}
