import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { apiRequest } from "../../lib/apiClient.js";

import { PortalNotifications } from "./PortalNotifications.js";

vi.mock("../../lib/apiClient.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("affiche les alertes scolaires et marque une notification comme lue dans le contexte portail", async () => {
  let read = false;
  vi.mocked(apiRequest).mockImplementation((_path, options) => {
    if (options?.method === "PATCH") {
      read = true;
      return Promise.resolve({});
    }
    return Promise.resolve([
      {
        id: "n",
        type: "grade.published",
        channel: "IN_APP",
        title: "Nouvelle note publiée",
        body: "Sara · École de la vie",
        createdAt: "2026-10-24",
        readAt: read ? "2026-10-24" : null,
      },
      {
        id: "staff",
        type: "course.review.rejected",
        channel: "IN_APP",
        title: "Décision enseignant",
        createdAt: "2026-10-24",
      },
    ]);
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PortalNotifications accessToken="pupil" />
    </QueryClientProvider>,
  );
  await screen.findByText("Sara · École de la vie");
  expect(screen.queryByText("Décision enseignant")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Marquer comme lue" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Marquer comme lue" })).not.toBeInTheDocument(),
  );
  expect(apiRequest).toHaveBeenCalledWith("/communication/notifications/n/read", {
    method: "PATCH",
    accessToken: "pupil",
    authContext: "portal",
  });
});
