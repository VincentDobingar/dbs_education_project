import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { apiRequest } from "../../lib/apiClient.js";

import { PortalSchoolFollowUp } from "./PortalSchoolFollowUp.js";

vi.mock("../../lib/apiClient.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("affiche les notes publiées et le suivi disciplinaire du seul enfant sélectionné", async () => {
  vi.mocked(apiRequest).mockImplementation((path) =>
    Promise.resolve(
      path.endsWith("/grades")
        ? [
            {
              id: "g",
              score: "17",
              isAbsent: false,
              assessment: { title: "Contrôle", maxScore: "20", subject: { nameFr: "Mathématiques" } },
            },
          ]
        : [
            {
              id: "i",
              occurredAt: "2026-10-24",
              description: "Incident de test",
              severity: "MINOR",
              sanction: "Rappel",
              correctiveAction: "Dialogue",
            },
          ],
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PortalSchoolFollowUp studentId="sara" accessToken="parent" parent />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/Contrôle : 17 \/ 20/)).toBeTruthy();
  expect(await screen.findByText(/Incident de test/)).toBeTruthy();
  expect(screen.getByText("Sanction : Rappel")).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith("/parent-portal/children/sara/incidents", {
    accessToken: "parent",
    authContext: "portal",
  });
});
