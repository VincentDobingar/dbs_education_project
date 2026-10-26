import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";
import { savePortalSession } from "../../lib/portalSession.js";

import { PortalRemedialPage } from "./PortalRemedialPage.js";

const OFFER = {
  id: "offer-1",
  title: "Préparation au BEPC — mathématiques",
  description: "Fonctions, Thalès et statistiques.",
  subjectLabel: "Mathématiques",
  levelLabel: "3e",
  mode: "ONSITE",
  format: "GROUP",
  location: "Salle 4",
  scheduleNote: "Samedi 9 h – 12 h",
  startsOn: "2099-11-02T00:00:00.000Z",
  endsOn: "2099-12-18T00:00:00.000Z",
  totalMinutes: 360,
  priceCents: 15000,
  currency: { isoCode: "XAF", symbol: "FCFA", decimalDigits: 0 },
  capacity: 10,
  seatsLeft: 4,
  teacher: "Awa M.",
  school: {
    name: "Collège Horizon",
    city: "Moundou",
    countryIsoCode: "TD",
    countryNameFr: "Tchad",
    countryNameEn: "Chad",
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PortalRemedialPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
  render(ui);
}

describe("PortalRemedialPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("fr");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("présente les cours d'autres établissements et inscrit l'enfant choisi", async () => {
    savePortalSession({ accessToken: "token", refreshToken: "refresh", email: "parent@example.test" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/remedial-portal/catalog")) return Promise.resolve(json([OFFER]));
      if (url.includes("/remedial-portal/learners"))
        return Promise.resolve(
          json([
            {
              studentId: "stu-1",
              firstName: "Mahamat",
              lastName: "Ali",
              schoolName: "Lycée de Bongor",
              enrolledAs: "PARENT",
            },
          ]),
        );
      if (url.includes("/remedial-portal/enrollments") && init?.method === "POST")
        return Promise.resolve(json({ id: "enr-1" }, 201));
      if (url.includes("/remedial-portal/enrollments")) return Promise.resolve(json([]));
      return Promise.resolve(json({}, 404));
    });

    renderPage();

    expect(await screen.findByText("Préparation au BEPC — mathématiques")).toBeInTheDocument();
    expect(screen.getByText("Awa M. — Collège Horizon")).toBeInTheDocument();
    expect(screen.getByText("4 places restantes")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "S'inscrire" }));
    expect(screen.getByRole("combobox", { name: "Élève à inscrire" })).toHaveTextContent(
      "Mahamat Ali — Lycée de Bongor",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'inscription" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({ offerId: "offer-1", studentId: "stu-1" });
    });
    expect(await screen.findByText("Aucune inscription pour l'instant.")).toBeInTheDocument();
  });
});
