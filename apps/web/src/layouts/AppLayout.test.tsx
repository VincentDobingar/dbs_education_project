import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n.js";
import { saveSession } from "../lib/session.js";

vi.mock("../lib/schoolConfigApi.js", () => ({
  getTenantLogo: vi.fn().mockResolvedValue({ logoUrl: null }),
}));

import { AppLayout } from "./AppLayout.js";

function renderLayoutFor(roleCodes: string[]): void {
  saveSession({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    subdomain: "ecole-test",
    tenantId: "tenant-1",
    tenantName: "École Test",
    email: "user@example.test",
    roleCodes,
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/tableau-de-bord"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/tableau-de-bord" element={<div>dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

// Nav filtering par roleCodes (audit design/sécurité 2026-09-22) : avant ce
// correctif, AppLayout affichait TOUS les liens à tout membre du tenant,
// quel que soit son rôle — un TEACHER voyait "Personnel"/"Finances"/
// "Configuration" bien que chaque action y renvoie 403 côté API.
describe("AppLayout — navigation filtrée par rôle", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("fr");
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("un TEACHER ne voit que les modules auxquels il a accès", () => {
    renderLayoutFor(["TEACHER"]);

    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    expect(screen.getByText("Élèves")).toBeInTheDocument();
    expect(screen.getByText("Emplois du temps")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();

    expect(screen.queryByText("Personnel")).not.toBeInTheDocument();
    expect(screen.queryByText("Finances")).not.toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Utilisateurs")).not.toBeInTheDocument();
    expect(screen.queryByText("Bibliothèque")).not.toBeInTheDocument();
  });

  it("un SCHOOL_OWNER voit tous les modules", () => {
    renderLayoutFor(["SCHOOL_OWNER"]);

    for (const label of [
      "Tableau de bord",
      "Élèves",
      "Utilisateurs",
      "Personnel",
      "Finances",
      "Configuration",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("un ACCOUNTANT voit Finances mais pas Personnel ni les modules pédagogiques", () => {
    renderLayoutFor(["ACCOUNTANT"]);

    expect(screen.getByText("Finances")).toBeInTheDocument();
    expect(screen.queryByText("Personnel")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Discipline")).not.toBeInTheDocument();
  });
});
