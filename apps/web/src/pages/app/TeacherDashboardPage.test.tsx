import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import * as api from "../../lib/teacherApi.js";

import { TeacherDashboardPage } from "./TeacherDashboardPage.js";
vi.mock("./TeacherCourseNotifications.js", () => ({ TeacherCourseNotifications: () => null }));

vi.mock("../../lib/useSession.js", () => ({
  useRequiredSession: () => ({ accessToken: "teacher", subdomain: "school" }),
}));
vi.mock("../../lib/teacherApi.js", () => ({
  getTeacherWorkspace: vi.fn(),
  getTeacherClassroom: vi.fn(),
  getTeacherAttendance: vi.fn(),
  getTeacherGrades: vi.fn(),
  saveTeacherAttendance: vi.fn(),
  saveTeacherGrades: vi.fn(),
  createTeacherAssessment: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function show(published = false) {
  vi.mocked(api.getTeacherWorkspace).mockResolvedValue({
    employee: { firstName: "Awa", lastName: "Test", email: null },
    assignments: [
      {
        id: "a",
        classroomId: "c",
        subjectId: "s",
        academicYearId: "y",
        classroom: { name: "3e A" },
        subject: { nameFr: "Maths" },
        academicYear: { name: "2026" },
      },
    ],
    periods: [],
    assessmentTypes: [],
    summary: { announcements: [], upcomingHomework: [] },
  });
  vi.mocked(api.getTeacherClassroom).mockResolvedValue({
    students: [{ id: "student", firstName: "Sara", lastName: "Test", matricule: "MAT" }],
    assessments: [
      { id: "exam", title: "Contrôle", maxScore: "20", isPublished: published, academicPeriodId: "p" },
    ],
  });
  vi.mocked(api.getTeacherAttendance).mockResolvedValue([{ studentId: "student", status: "ABSENT" }]);
  vi.mocked(api.getTeacherGrades).mockResolvedValue([]);
  vi.mocked(api.saveTeacherGrades).mockResolvedValue({});
  vi.mocked(api.saveTeacherAttendance).mockResolvedValue({});
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeacherDashboardPage />
    </QueryClientProvider>,
  );
}
it("reprend l'appel existant et enregistre les présences de l'affectation", async () => {
  show();
  await screen.findByRole("heading", { name: "Liste de présence" });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Test Sara" })).toHaveValue("ABSENT"));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les présences" }));
  await waitFor(() =>
    expect(api.saveTeacherAttendance).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ entries: [{ studentId: "student", status: "ABSENT" }] }),
      { accessToken: "teacher", subdomain: "school" },
    ),
  );
});
it("refuse une note vide puis enregistre la note saisie", async () => {
  show();
  fireEvent.change(await screen.findByRole("combobox", { name: "Évaluation" }), {
    target: { value: "exam" },
  });
  const input = await screen.findByRole("spinbutton", { name: "Note de Sara Test" });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les notes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Renseignez une note");
  expect(api.saveTeacherGrades).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "17" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les notes" }));
  await waitFor(() =>
    expect(api.saveTeacherGrades).toHaveBeenCalledWith(
      "a",
      "exam",
      { grades: [{ studentId: "student", score: 17, isAbsent: false }] },
      { accessToken: "teacher", subdomain: "school" },
    ),
  );
});
it("verrouille les évaluations publiées", async () => {
  show(true);
  fireEvent.change(await screen.findByRole("combobox", { name: "Évaluation" }), {
    target: { value: "exam" },
  });
  expect(await screen.findByRole("spinbutton", { name: "Note de Sara Test" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Enregistrer les notes" })).toBeDisabled();
});
