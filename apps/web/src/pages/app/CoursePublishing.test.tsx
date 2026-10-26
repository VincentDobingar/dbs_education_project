import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { apiRequest, apiUpload } from "../../lib/apiClient.js";

import { CoursePublishing } from "./CoursePublishing.js";

const session = vi.hoisted(() => ({ roleCodes: ["TEACHER"] }));
vi.mock("../../lib/useSession.js", () => ({ useRequiredSession: () => session }));
vi.mock("../../lib/apiClient.js", () => ({ apiRequest: vi.fn(), apiUpload: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  session.roleCodes = ["TEACHER"];
});
const creds = { accessToken: "token", subdomain: "school" };
function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CoursePublishing
        course={{
          id: "course",
          classroomId: "class",
          subjectId: "math",
          createdByEmployeeId: "teacher",
          title: "Cours",
          description: null,
          deletedAt: null,
          approvalStatus: "PENDING",
        }}
        creds={creds}
      />
    </QueryClientProvider>,
  );
}
it("permet au professeur de charger un PDF sans bouton d'auto-validation", async () => {
  vi.mocked(apiUpload).mockResolvedValue({});
  show();
  expect(
    screen.queryByRole("button", { name: "Valider et rendre visible aux familles" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Titre du PDF"), { target: { value: "Fractions" } });
  const file = new File(["%PDF-1.4"], "fractions.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Fichier PDF (10 Mo maximum)"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Charger le PDF" }));
  await waitFor(() =>
    expect(apiUpload).toHaveBeenCalledWith("/elearning/courses/course/pdf", "file", file, creds, {
      title: "Fractions",
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("attend sa validation");
});
it("réserve la validation à l'administration", async () => {
  session.roleCodes = ["SCHOOL_ADMIN"];
  vi.mocked(apiRequest).mockResolvedValue({});
  show();
  expect(screen.queryByRole("button", { name: "Charger le PDF" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Valider et rendre visible aux familles" }));
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith("/elearning/courses/course/review", {
      ...creds,
      method: "POST",
      body: { status: "APPROVED" },
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Décision enregistrée");
});

it("enregistre également le refus administratif", async () => {
  session.roleCodes = ["SCHOOL_ADMIN"];
  vi.mocked(apiRequest).mockResolvedValue({});
  show();
  fireEvent.click(screen.getByRole("button", { name: "Refuser le cours" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Saisissez un motif");
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Motif du refus (obligatoire pour refuser)" }), {
    target: { value: "  Corriger les exemples.  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refuser le cours" }));
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith("/elearning/courses/course/review", {
      ...creds,
      method: "POST",
      body: { status: "REJECTED", comment: "Corriger les exemples." },
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Décision enregistrée");
});
