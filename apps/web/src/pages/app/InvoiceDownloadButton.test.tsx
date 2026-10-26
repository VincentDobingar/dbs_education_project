import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { fetchStudentInvoicePdf } from "../../lib/financeApi.js";

import { InvoiceDownloadButton } from "./InvoiceDownloadButton.js";

vi.mock("../../lib/financeApi.js", () => ({ fetchStudentInvoicePdf: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("télécharge la facture avec les identifiants de l'établissement et libère le lien", async () => {
  vi.mocked(fetchStudentInvoicePdf).mockResolvedValue(new Blob(["%PDF-1.4"]));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn().mockReturnValue("blob:invoice"),
      revokeObjectURL: revoke,
    }),
  );
  const creds = { accessToken: "staff-token", subdomain: "ecolevie" };
  const view = render(<InvoiceDownloadButton invoiceId="invoice" creds={creds} />);
  fireEvent.click(screen.getByRole("button", { name: "Télécharger la facture" }));
  const link = await screen.findByRole("link", { name: "Télécharger le document PDF" });
  expect(link).toHaveAttribute("download", "facture-invoice.pdf");
  expect(fetchStudentInvoicePdf).toHaveBeenCalledWith("invoice", creds);
  expect(click).toHaveBeenCalledOnce();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:invoice");
});
it("affiche un échec sans laisser le bouton bloqué", async () => {
  vi.mocked(fetchStudentInvoicePdf).mockRejectedValue(new Error("403"));
  render(
    <InvoiceDownloadButton invoiceId="invoice" creds={{ accessToken: "token", subdomain: "ecolevie" }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Télécharger la facture" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("échoué");
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
});
