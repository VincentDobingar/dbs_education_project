import { cleanup, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import adminGuide from "../content/guide-administration.md?raw";
import publicGuide from "../content/guide-utilisateur.md?raw";
import i18n from "../i18n.js";
import { guideSections, slugify } from "../lib/guide.js";

import { GuideArticle } from "./GuideArticle.js";

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(() => {
  cleanup();
});

describe("slugify", () => {
  it("retire accents et ponctuation", () => {
    expect(slugify("Rôles et menus")).toBe("roles-et-menus");
    expect(slugify("Démarrer : inscription et abonnement")).toBe("demarrer-inscription-et-abonnement");
  });
});

describe("contenu du guide", () => {
  it("le guide public ne révèle pas l'administration de la plateforme", () => {
    expect(publicGuide).not.toMatch(/\/admin|AuriGeo|db:seed|rôle plateforme/);
  });

  it("chaque guide a des sections au titre unique", () => {
    for (const source of [publicGuide, adminGuide]) {
      const ids = guideSections(source).map((section) => section.id);
      expect(ids.length).toBeGreaterThan(2);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("GuideArticle", () => {
  it("rend un sommaire relié aux titres, des tableaux et des liens internes", () => {
    const source = [
      "## Accès à la plateforme",
      "",
      "Se rendre sur [la connexion](/connexion).",
      "",
      "| Espace | Pour qui |",
      "| --- | --- |",
      "| Établissement | Personnel |",
      "",
      "## Rôles et menus",
      "",
      "Texte.",
    ].join("\n");

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <GuideArticle source={source} pdfHref="/guide.pdf" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Rôles et menus" })).toHaveAttribute(
      "id",
      "roles-et-menus",
    );
    const toc = screen.getByRole("navigation", { name: "Sommaire" });
    expect(within(toc).getAllByRole("link", { name: /Rôles et menus/ })[0]).toHaveAttribute(
      "href",
      "#roles-et-menus",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "la connexion" })).toHaveAttribute("href", "/connexion");
    expect(screen.getAllByRole("link", { name: "Télécharger le guide (PDF)" })[0]).toHaveAttribute(
      "href",
      "/guide.pdf",
    );
  });
});
