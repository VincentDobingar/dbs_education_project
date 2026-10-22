import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import i18n from "../../i18n.js";

import { HomePage } from "./HomePage.js";

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeAll(async () => {
    // jsdom's detected navigator language is not deterministic across CI/local
    // runs — pin the locale explicitly so this test doesn't depend on it.
    await i18n.changeLanguage("fr");
  });

  it("renders the hero headline", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(
      screen.getByText("Gérez votre établissement, en toute sécurité, du primaire à l'université"),
    ).toBeInTheDocument();
  });

  it("présente l'usage hors connexion et renvoie vers le guide", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Même quand le réseau coupe, l'essentiel reste à portée de main",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "En savoir plus dans le guide" })).toHaveAttribute(
      "href",
      "/guide#utilisation-hors-connexion",
    );
    expect(screen.getByRole("heading", { name: "Questions fréquentes" })).toBeInTheDocument();
  });
});
