import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/apiClient.js";
import { updateStudentProfile, uploadStudentPhoto, type Student } from "../../lib/studentsApi.js";

import { StudentProfileEditor } from "./StudentProfileEditor.js";
vi.mock("../../lib/studentsApi.js", () => ({ updateStudentProfile: vi.fn(), uploadStudentPhoto: vi.fn() }));
const student: Student = {
  id: "s",
  matricule: "MAT",
  firstName: "Sara",
  lastName: "Test",
  dateOfBirth: null,
  gender: null,
  photoUrl: null,
  status: "ACTIVE",
  address: null,
  phone: null,
};
const creds = { accessToken: "staff", subdomain: "school" };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentProfileEditor student={student} creds={creds} />
    </QueryClientProvider>,
  );
}
it("enregistre l'identité et les coordonnées avec le contexte établissement", async () => {
  vi.mocked(updateStudentProfile).mockResolvedValue({ ...student, address: "24 avenue Test" });
  show();
  fireEvent.change(screen.getByRole("textbox", { name: "Adresse" }), { target: { value: "24 avenue Test" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le profil" }));
  await waitFor(() =>
    expect(updateStudentProfile).toHaveBeenCalledWith(
      "s",
      expect.objectContaining({
        matricule: "MAT",
        firstName: "Sara",
        address: "24 avenue Test",
        dateOfBirth: null,
      }),
      creds,
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Profil enregistré");
});
it("téléverse une photo choisie dans le dossier de l'élève", async () => {
  vi.mocked(uploadStudentPhoto).mockResolvedValue({ photoUrl: "https://example.test/photo.png" });
  show();
  const file = new File(["test"], "photo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Choisir une photo d'identité (JPEG ou PNG, 3 Mo maximum)"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la photo d'identité" }));
  await waitFor(() => expect(uploadStudentPhoto).toHaveBeenCalledWith("s", file, creds));
  expect(await screen.findByRole("status")).toHaveTextContent("Photo enregistrée");
});
it("explique les doublons de matricule", async () => {
  vi.mocked(updateStudentProfile).mockRejectedValue(new ApiError(409, "MATRICULE_TAKEN", "duplicate"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le profil" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("matricule est déjà utilisé");
});
it("refuse un format d'image non accepté", () => {
  show();
  fireEvent.change(screen.getByLabelText("Choisir une photo d'identité (JPEG ou PNG, 3 Mo maximum)"), {
    target: { files: [new File(["pdf"], "photo.pdf", { type: "application/pdf" })] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("JPEG ou PNG");
  expect(screen.getByRole("button", { name: "Enregistrer la photo d'identité" })).toBeDisabled();
});
