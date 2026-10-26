import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { listNotifications, markNotificationRead, type Notification } from "../../lib/communicationApi.js";

import { TeacherCourseNotifications } from "./TeacherCourseNotifications.js";

vi.mock("../../lib/useSession.js", () => ({
  useRequiredSession: () => ({ accessToken: "teacher", tenantId: "school" }),
}));
vi.mock("../../lib/communicationApi.js", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("affiche le motif de refus du bon établissement et permet de marquer la décision comme lue", async () => {
  const notice: Notification = {
    id: "n",
    tenantId: "school",
    type: "course.review.rejected",
    title: "Cours refusé",
    body: "Motif : préciser les exemples.",
    channel: "IN_APP",
    status: "SENT",
    sentAt: null,
    readAt: null,
    createdAt: "2026-10-24T08:00:00Z",
  };
  vi.mocked(listNotifications).mockResolvedValue([
    notice,
    { ...notice, id: "other", tenantId: "other-school", body: "Établissement différent" },
  ]);
  vi.mocked(markNotificationRead).mockResolvedValue({
    ...notice,
    status: "READ",
    readAt: "2026-10-24T09:00:00Z",
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TeacherCourseNotifications />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Motif : préciser les exemples.")).toBeInTheDocument();
  expect(screen.queryByText("Établissement différent")).not.toBeInTheDocument();
  expect(screen.getByText("Non lue")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Marquer comme lue" }));
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("n", "teacher"));
});
