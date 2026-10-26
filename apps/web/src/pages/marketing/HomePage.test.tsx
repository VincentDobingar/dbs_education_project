import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";

import { HomePage } from "./HomePage.js";

function renderHome(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
  render(ui);
}

function mockSchools(schools: unknown[]): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(schools), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    // jsdom's detected navigator language is not deterministic across CI/local
    // runs — pin the locale explicitly so this test doesn't depend on it.
    await i18n.changeLanguage("fr");
  });

  it("renders the hero headline", () => {
    mockSchools([]);
    renderHome();

    expect(
      screen.getByText("Gérez votre établissement, en toute sécurité, du primaire à l'université"),
    ).toBeInTheDocument();
  });

  it("présente l'usage hors connexion et renvoie vers le guide", () => {
    mockSchools([]);
    renderHome();

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

  it("présente les établissements inscrits dans le carrousel « Ils nous font confiance »", async () => {
    mockSchools([
      {
        id: "t1",
        name: "Lycée Excellence de Moundou",
        logoUrl: null,
        publicDescription: "Lycée bilingue fondé en 1998.",
        ownershipType: "PRIVATE",
        city: "Moundou",
        countryIsoCode: "TD",
        countryNameFr: "Tchad",
        countryNameEn: "Chad",
      },
      {
        id: "t2",
        name: "Collège Public de Garoua",
        logoUrl: null,
        publicDescription: null,
        ownershipType: "PUBLIC",
        city: null,
        countryIsoCode: "CM",
        countryNameFr: "Cameroun",
        countryNameEn: "Cameroon",
      },
    ]);
    renderHome();

    expect(await screen.findByRole("heading", { name: "Ils nous font confiance" })).toBeInTheDocument();
    expect(screen.getByText("2 établissements nous ont rejoints")).toBeInTheDocument();
    expect(screen.getByText("Lycée Excellence de Moundou")).toBeInTheDocument();
    expect(screen.getByText("Lycée bilingue fondé en 1998.")).toBeInTheDocument();
    expect(screen.getByText("Moundou, Tchad")).toBeInTheDocument();
    // Sans présentation : texte par défaut selon le type d'établissement.
    expect(
      screen.getByText(
        "Établissement public qui gère sa scolarité, ses notes et ses finances sur la plateforme.",
      ),
    ).toBeInTheDocument();
  });

  it("n'affiche pas la section tant qu'aucun établissement n'est inscrit", async () => {
    mockSchools([]);
    renderHome();
    await screen.findByText("Questions fréquentes");
    expect(screen.queryByRole("heading", { name: "Ils nous font confiance" })).toBeNull();
  });
});
