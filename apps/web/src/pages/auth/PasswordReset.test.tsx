import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";
import type * as ApiModule from "../../lib/api.js";
import { ApiError } from "../../lib/apiClient.js";

const api = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("../../lib/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  ...api,
}));

import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAt(url: string): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
          <Route path="/reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("mot de passe oublié", () => {
  it("envoie la demande avec l'espace d'origine et affiche un message neutre", async () => {
    api.requestPasswordReset.mockResolvedValue({ message: "ok" });
    renderAt("/mot-de-passe-oublie?espace=portal");

    fireEvent.change(screen.getByLabelText("Adresse email"), { target: { value: "parent@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir le lien" }));

    expect(await screen.findByText("Vérifiez votre boîte e-mail")).toBeInTheDocument();
    expect(api.requestPasswordReset).toHaveBeenCalledWith("parent@example.test", "portal", "fr");
    expect(screen.getByRole("link", { name: "Retour à la connexion" })).toHaveAttribute(
      "href",
      "/portail/connexion",
    );
  });
});

describe("nouveau mot de passe", () => {
  it("utilise le jeton du lien, vérifie la confirmation puis renvoie vers la connexion", async () => {
    api.resetPassword.mockResolvedValue({ message: "ok" });
    renderAt("/reinitialiser-mot-de-passe?espace=admin#token=abc123");

    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "Nouveau-Mot-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
      target: { value: "Autre-Mot-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(screen.getByText("Les deux mots de passe ne sont pas identiques.")).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
      target: { value: "Nouveau-Mot-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));

    expect(await screen.findByText("Mot de passe modifié")).toBeInTheDocument();
    expect(api.resetPassword).toHaveBeenCalledWith("abc123", "Nouveau-Mot-2026");
    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/admin/connexion");
  });

  it("propose un nouveau lien quand le jeton est expiré ou absent", async () => {
    api.resetPassword.mockRejectedValue(new ApiError(410, "PASSWORD_RESET_TOKEN_EXPIRED", "expired"));
    renderAt("/reinitialiser-mot-de-passe#token=expire");

    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "Nouveau-Mot-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
      target: { value: "Nouveau-Mot-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Ce lien n'est plus valable")).toBeInTheDocument();

    cleanup();
    renderAt("/reinitialiser-mot-de-passe");
    expect(screen.getByRole("link", { name: "Demander un nouveau lien" })).toHaveAttribute(
      "href",
      "/mot-de-passe-oublie?espace=staff",
    );
  });
});
