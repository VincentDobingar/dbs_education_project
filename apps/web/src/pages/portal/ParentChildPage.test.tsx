vi.mock("./PortalTimetable.js", () => ({ PortalTimetable: () => null }));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";
import type * as ApiClient from "../../lib/apiClient.js";
import { ApiError, apiRequest } from "../../lib/apiClient.js";
import {
  fetchChildIdCardPdf,
  fetchChildInvoicePdf,
  fetchChildReportCardPdf,
} from "../../lib/parentPortalApi.js";

import { ParentChildPage } from "./ParentChildPage.js";
vi.mock("./FamilyCourses.js", () => ({ FamilyCourses: () => null }));

vi.mock("../../lib/portalSession.js", () => ({ loadPortalSession: () => ({ accessToken: "parent-token" }) }));
vi.mock("../../lib/apiClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiRequest: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../../lib/parentPortalApi.js", () => ({
  getChildAttendance: vi.fn().mockResolvedValue([]),
  getChildTimetable: vi.fn().mockResolvedValue([]),
  getChildReportCards: vi
    .fn()
    .mockResolvedValue([{ id: "card", averageScore: 15, classRank: null, mention: "Bien" }]),
  getChildAnnouncements: vi.fn().mockResolvedValue([]),
  getChildHomework: vi.fn().mockResolvedValue([]),
  getChildFinancialSituation: vi.fn().mockResolvedValue({
    totalInvoicedCents: 0,
    totalPaidCents: 0,
    outstandingCents: 0,
    overdueInvoices: [],
    invoices: [{ id: "invoice", number: "INV-TEST", totalCents: 1000000, status: "ISSUED" }],
  }),
  getChildReceipts: vi.fn().mockResolvedValue([]),
  fetchChildReportCardPdf: vi.fn(),
  fetchChildReceiptPdf: vi.fn(),
  fetchChildInvoicePdf: vi.fn(),
  fetchChildIdCardPdf: vi.fn(),
}));
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/children/child"]}>
          <Routes>
            <Route path="/children/:studentId" element={<ParentChildPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await i18n.changeLanguage("fr");
  vi.mocked(apiRequest).mockResolvedValue({ allowed: true });
});
describe("téléchargement des bulletins parent", () => {
  it("explique le refus du forfait au lieu de laisser une erreur invisible", async () => {
    vi.mocked(fetchChildReportCardPdf).mockRejectedValue(
      new ApiError(403, "FEATURE_NOT_INCLUDED", "Not included"),
    );
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Voir le PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Votre formule ne comprend pas le téléchargement des bulletins",
    );
  });
  it("déclenche un téléchargement sans dépendre d'une fenêtre surgissante", async () => {
    vi.mocked(fetchChildReportCardPdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn().mockReturnValue("blob:report"),
        revokeObjectURL,
      }),
    );
    const client = show();
    fireEvent.click(await screen.findByRole("button", { name: "Voir le PDF" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(await screen.findByRole("link", { name: "Télécharger le document PDF" })).toHaveAttribute(
      "download",
      "bulletin-card.pdf",
    );
    expect(fetchChildReportCardPdf).toHaveBeenCalledWith("child", "card", "parent-token");
    let confirmAccess: (value: { allowed: boolean }) => void = () => {};
    const pendingAccess = new Promise<{ allowed: boolean }>((resolve) => {
      confirmAccess = resolve;
    });
    vi.mocked(apiRequest).mockReturnValueOnce(pendingAccess);
    void client.invalidateQueries({ queryKey: ["parent-child-access"] });
    await waitFor(() => expect(screen.getByText("Vérification de la couverture…")).toBeVisible());
    expect(screen.getByRole("link", { name: "Télécharger le document PDF", hidden: true })).not.toBeVisible();
    confirmAccess({ allowed: true });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Télécharger le document PDF" })).toHaveAttribute(
        "href",
        "blob:report",
      ),
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(402, "SUBSCRIPTION_INACTIVE", "Expired"));
    void client.invalidateQueries({ queryKey: ["parent-child-access"] });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("abonnement actif"));
    expect(screen.queryByRole("link", { name: "Télécharger le document PDF" })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });
});

it("télécharge la facture de l'enfant et conserve un lien de téléchargement", async () => {
  vi.mocked(fetchChildInvoicePdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn().mockReturnValue("blob:invoice"),
      revokeObjectURL: vi.fn(),
    }),
  );
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Télécharger la facture" }));
  await waitFor(() => expect(fetchChildInvoicePdf).toHaveBeenCalledWith("child", "invoice", "parent-token"));
  expect(await screen.findByRole("link", { name: "Télécharger le document PDF" })).toHaveAttribute(
    "download",
    "facture-invoice.pdf",
  );
  expect(click).toHaveBeenCalledOnce();
  click.mockRestore();
});

it("télécharge la carte scolaire de l'enfant avec un lien persistant", async () => {
  vi.mocked(fetchChildIdCardPdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn().mockReturnValue("blob:card"),
      revokeObjectURL: vi.fn(),
    }),
  );
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Télécharger la carte scolaire" }));
  expect(await screen.findByRole("link", { name: "Télécharger le document PDF" })).toHaveAttribute(
    "download",
    "carte-scolaire-child.pdf",
  );
  expect(fetchChildIdCardPdf).toHaveBeenCalledWith("child", "parent-token");
  expect(click).toHaveBeenCalledOnce();
  click.mockRestore();
});
