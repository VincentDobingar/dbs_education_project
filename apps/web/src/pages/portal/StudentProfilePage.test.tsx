import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { updateMyStudentProfile, uploadMyStudentPhoto } from "../../lib/studentPortalApi.js";

import { StudentProfilePage } from "./StudentProfilePage.js";
vi.mock("../../lib/portalSession.js", () => ({ loadPortalSession: () => ({ accessToken: "token" }) }));
vi.mock("../../lib/familyApi.js", () => ({
  listLinkedStudents: () => Promise.resolve([{ student: { id: "s" } }]),
}));
vi.mock("../../lib/studentPortalApi.js", () => ({
  getStudentProfile: () =>
    Promise.resolve({
      student: {
        id: "s",
        firstName: "Sara",
        lastName: "Test",
        matricule: "MAT",
        address: null,
        phone: null,
        birthPlace: null,
        nationality: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        photoUrl: null,
      },
      currentEnrollment: { classroomName: "3e A", academicYearName: "2026-2027" },
    }),
  updateMyStudentProfile: vi.fn().mockResolvedValue({}),
  uploadMyStudentPhoto: vi.fn().mockResolvedValue({}),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentProfilePage />
    </QueryClientProvider>,
  );
}
it("enregistre les coordonnées du dossier élève lié", async () => {
  show();
  fireEvent.change(await screen.findByRole("textbox", { name: "Adresse" }), {
    target: { value: "12 avenue Test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes coordonnées" }));
  await waitFor(() =>
    expect(updateMyStudentProfile).toHaveBeenCalledWith(
      "s",
      expect.objectContaining({ address: "12 avenue Test" }),
      "token",
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Coordonnées enregistrées");
});
it("envoie le fichier sélectionné comme photo", async () => {
  show();
  const input = await screen.findByLabelText("Choisir une photo (JPEG ou PNG, 3 Mo maximum)");
  const file = new File(["test"], "photo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo" }));
  await waitFor(() => expect(uploadMyStudentPhoto).toHaveBeenCalledWith("s", file, "token"));
  expect(await screen.findByRole("status")).toHaveTextContent("Photo enregistrée");
});
