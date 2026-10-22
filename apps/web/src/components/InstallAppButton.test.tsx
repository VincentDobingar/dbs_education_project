import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n.js";
import { isIos, resetInstallStateForTests } from "../lib/pwaInstall.js";

import { InstallAppButton } from "./InstallAppButton.js";

function renderButton(): void {
  const ui: ReactNode = (
    <I18nextProvider i18n={i18n}>
      <InstallAppButton className="btn" />
    </I18nextProvider>
  );
  render(ui);
}

function setUserAgent(value: string, maxTouchPoints = 0): void {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
  // jsdom ne définit pas maxTouchPoints.
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

// L'état d'installation vit au niveau du module (l'événement arrive avant React).
beforeEach(() => {
  resetInstallStateForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InstallAppButton", () => {
  it("n'affiche rien quand le navigateur ne propose pas l'installation", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0");
    renderButton();
    expect(screen.queryByRole("button", { name: "Installer l'application" })).toBeNull();
  });

  it("ouvre l'invite native d'Android/Chrome", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile");
    renderButton();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Installer l'application" }));
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("explique l'installation sur iPhone", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", 5);
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Installer l'application" }));
    const dialog = screen.getByRole("dialog", { name: "Installer l'application sur iPhone" });
    expect(dialog).toHaveTextContent("Sur l'écran d'accueil");

    fireEvent.click(screen.getByRole("button", { name: "J'ai compris" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reconnaît un iPad qui se présente comme un Mac", () => {
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe(false);
  });
});
