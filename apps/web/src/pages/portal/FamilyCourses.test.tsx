import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { apiRequest, fetchBlob } from "../../lib/apiClient.js";

import { FamilyCourses } from "./FamilyCourses.js";

vi.mock("../../lib/apiClient.js", () => ({ apiRequest: vi.fn(), fetchBlob: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("affiche les cours validés du bon enfant et prépare le PDF avec sa session parent", async () => {
  vi.mocked(apiRequest).mockImplementation((path) => Promise.resolve(
    path.endsWith("/courses")
      ? [{ id: "c", title: "Fractions" }]
      : { resources: [{ id: "pdf", title: "Support PDF", fileKey: "private.pdf" }] },
  ));
  vi.mocked(fetchBlob).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:course"), revokeObjectURL: vi.fn() });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FamilyCourses studentId="sara" accessToken="parent" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Fractions" }));
  fireEvent.click(await screen.findByRole("button", { name: "Préparer le PDF du cours" }));
  await waitFor(() =>
    expect(fetchBlob).toHaveBeenCalledWith("/parent-portal/children/sara/courses/c/resources/pdf/file", {
      accessToken: "parent",
      authContext: "portal",
    }),
  );
  expect(await screen.findByRole("link", { name: "Télécharger le cours PDF" })).toHaveAttribute(
    "download",
    "cours.pdf",
  );
});
