import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enrollStudent } from "../../lib/studentsApi.js";

import { RegistrationsPage } from "./RegistrationsPage.js";

vi.mock("../../lib/useSession.js", () => ({
  useRequiredSession: () => ({ accessToken: "token", subdomain: "school", roleCodes: ["SCHOOL_OWNER"] }),
}));
vi.mock("../../lib/schoolConfigApi.js", () => ({
  listAcademicYears: vi.fn().mockResolvedValue([
    { id: "year-a", name: "2026-2027" },
    { id: "year-b", name: "2027-2028" },
  ]),
  listClassrooms: vi.fn().mockResolvedValue([
    { id: "class-a", name: "CP A", academicYearId: "year-a", campusId: "campus", gradeLevelId: "grade" },
    {
      id: "class-b",
      name: "CP B autre année",
      academicYearId: "year-b",
      campusId: "campus",
      gradeLevelId: "grade",
    },
  ]),
}));
vi.mock("../../lib/registrationApi.js", () => ({
  listRegistrationPeriods: vi.fn().mockImplementation(() =>
    Promise.resolve([
      {
        id: "period-a",
        academicYearId: "year-a",
        name: "Rentrée A",
        isOpen: true,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        academicYear: { id: "year-a", name: "2026-2027" },
        installments: [{ amountCents: 10000, dueDate: "2026-12-01T00:00:00Z" }],
      },
    ]),
  ),
  listRegistrations: vi.fn().mockResolvedValue([]),
  createRegistrationPeriod: vi.fn(),
  setRegistrationPeriodOpen: vi.fn(),
}));
vi.mock("../../lib/studentsApi.js", () => ({
  listStudents: vi.fn().mockResolvedValue([
    { id: "student-a", matricule: "A1", firstName: "Awa", lastName: "Test", primaryGuardianId: "parent" },
    { id: "student-b", matricule: "B1", firstName: "Paul", lastName: "Test", primaryGuardianId: null },
  ]),
  enrollStudent: vi.fn().mockResolvedValue({ id: "enrollment" }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function showPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RegistrationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("inscription depuis l'interface", () => {
  it("filtre les classes par année de période et bloque un dossier sans tuteur", async () => {
    showPage();
    await screen.findByRole("option", { name: "Rentrée A (2026-2027)" });
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "period-a" } });
    expect(screen.getByRole("option", { name: "CP A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "CP B autre année" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Élève"), { target: { value: "student-b" } });
    expect(
      screen.getByRole("button", { name: "Confirmer l'inscription et créer les échéances" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "la fiche élève" })).toHaveAttribute("href", "/eleves/student-b");
  });
  it("transmet l'élève, la période et la classe cohérente à la confirmation", async () => {
    showPage();
    await screen.findByRole("option", { name: "Rentrée A (2026-2027)" });
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "period-a" } });
    fireEvent.change(screen.getByLabelText("Élève"), { target: { value: "student-a" } });
    fireEvent.change(screen.getByLabelText("Classe"), { target: { value: "class-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'inscription et créer les échéances" }));
    await waitFor(() =>
      expect(enrollStudent).toHaveBeenCalledWith(
        "student-a",
        {
          registrationPeriodId: "period-a",
          academicYearId: "year-a",
          classroomId: "class-a",
          campusId: "campus",
          gradeLevelId: "grade",
        },
        { accessToken: "token", subdomain: "school" },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Inscription enregistrée et factures créées.",
    );
  });
});
