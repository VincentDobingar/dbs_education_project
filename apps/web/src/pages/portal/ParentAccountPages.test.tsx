import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";
import {
  getParentProfile,
  getParentSubscriptions,
  subscribeParent,
  updateParentProfile,
} from "../../lib/parentAccountApi.js";
import { getParentDashboard } from "../../lib/parentPortalApi.js";

import { ParentDashboardPage } from "./ParentDashboardPage.js";
import { ParentProfilePage } from "./ParentProfilePage.js";
import { ParentSubscriptionsPage } from "./ParentSubscriptionsPage.js";

vi.mock("../../lib/portalSession.js", () => ({
  loadPortalSession: () => ({ accessToken: "parent-token", email: "parent@example.test" }),
  savePortalSession: vi.fn(),
}));
vi.mock("../../lib/parentPortalApi.js", () => ({ getParentDashboard: vi.fn() }));
vi.mock("../../lib/parentAccountApi.js", () => ({
  getParentProfile: vi.fn(),
  updateParentProfile: vi.fn(),
  requestParentContactChange: vi.fn(),
  confirmParentContactChange: vi.fn(),
  getCoverageOptions: vi.fn().mockResolvedValue([
    {
      studentId: "a",
      tenantId: "school-a",
      firstName: "Awa",
      lastName: "Test",
      tenantName: "École A",
      covered: false,
    },
    {
      studentId: "b",
      tenantId: "school-b",
      firstName: "Paul",
      lastName: "Test",
      tenantName: "École B",
      covered: false,
    },
  ]),
  getParentPlans: vi.fn().mockResolvedValue([
    { code: "PARENT_BASIC", nameFr: "Individuel", childrenCovered: 1 },
    { code: "FAMILY_PLAN", nameFr: "Famille", childrenCovered: 5 },
  ]),
  getParentSubscriptions: vi.fn(),
  subscribeParent: vi.fn().mockResolvedValue({ id: "draft" }),
  attachParentChildren: vi.fn(),
  cancelParentSubscription: vi.fn(),
  invoiceParentSubscription: vi.fn(),
  prepareParentPayment: vi.fn(),
}));
beforeEach(async () => {
  await i18n.changeLanguage("fr");
  vi.mocked(getParentDashboard).mockResolvedValue({ children: [], subscription: null });
  vi.mocked(getParentProfile).mockResolvedValue({
    id: "parent",
    firstName: "Marie",
    lastName: "Diallo",
    email: "parent@example.test",
    phone: "+237600000000",
    address: "Douala",
    schools: [{ id: "school-a", name: "École A" }],
  });
  vi.mocked(updateParentProfile).mockResolvedValue({
    id: "parent",
    firstName: "Mariam",
    lastName: "Diallo",
    email: "parent@example.test",
    phone: "+237600000000",
    address: "Douala",
  });
  vi.mocked(getParentSubscriptions).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(page: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{page}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}
describe("espace parent : droits, profil et choix de couverture", () => {
  it("oriente vers les abonnements sans afficher de données d'enfant non couvert", async () => {
    show(<ParentDashboardPage />);
    expect(await screen.findByText(/Aucun enfant couvert par un abonnement actif/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Gérer mes abonnements et les enfants couverts" }),
    ).toHaveAttribute("href", "/portail/abonnements");
  });
  it("masque aussi les anciennes données en mémoire si la vérification réseau échoue", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["parent-dashboard", "parent-token"], {
      children: [
        {
          student: { id: "a", firstName: "Ancien enfant", lastName: "Test" },
          financialSituation: { outstandingCents: 100 },
          announcements: [],
        },
      ],
      subscription: null,
    });
    vi.mocked(getParentDashboard).mockRejectedValue(new Error("Réseau indisponible"));
    show(<ParentDashboardPage />, client);
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de vérifier votre couverture");
    expect(screen.queryByText("Ancien enfant Test")).not.toBeInTheDocument();
  });
  it("envoie les coordonnées communes au profil central sans changer directement l'email", async () => {
    show(<ParentProfilePage />);
    const firstName = await screen.findByLabelText("Prénom");
    fireEvent.change(firstName, { target: { value: "Mariam" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et synchroniser" }));
    await waitFor(() =>
      expect(updateParentProfile).toHaveBeenCalledWith(
        { firstName: "Mariam", lastName: "Diallo", address: "Douala" },
        "parent-token",
      ),
    );
    expect(
      await screen.findByText("Profil enregistré et synchronisé avec les établissements liés."),
    ).toBeInTheDocument();
  });
  it("borne la formule individuelle et permet la sélection familiale multi-établissements", async () => {
    show(<ParentSubscriptionsPage />);
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    fireEvent.change(screen.getByLabelText("Formule"), { target: { value: "PARENT_BASIC" } });
    expect(screen.getByRole("button", { name: "Créer l'abonnement" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Formule"), { target: { value: "FAMILY_PLAN" } });
    fireEvent.change(screen.getByLabelText("Code promotionnel (facultatif)"), {
      target: { value: "  PROMO-TEST  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Créer l'abonnement" }));
    await waitFor(() =>
      expect(subscribeParent).toHaveBeenCalledWith(
        {
          planCode: "FAMILY_PLAN",
          promoCode: "PROMO-TEST",
          billingPeriod: "MONTHLY",
          children: [
            { studentId: "a", tenantId: "school-a" },
            { studentId: "b", tenantId: "school-b" },
          ],
        },
        "parent-token",
      ),
    );
    expect(
      await screen.findByText("Abonnement créé. Préparez son règlement ci-dessous."),
    ).toBeInTheDocument();
  });
});
