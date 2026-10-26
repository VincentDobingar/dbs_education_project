import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { listAttendance } from "../../lib/attendanceApi.js";
import { listAssessments, listGradesForAssessment, publishAssessment } from "../../lib/gradingApi.js";
import { listClassrooms, listAcademicYears, listSubjects } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";

import { SchoolClassReview } from "./SchoolClassReview.js";
const role = vi.hoisted(() => ({ codes: ["SCHOOL_ADMIN"] }));

vi.mock("../../lib/useSession.js", () => ({
  useRequiredSession: () => ({ accessToken: "admin", subdomain: "school", roleCodes: role.codes }),
}));
vi.mock("../../lib/attendanceApi.js", () => ({ listAttendance: vi.fn() }));
vi.mock("../../lib/gradingApi.js", () => ({
  listAssessments: vi.fn(),
  listGradesForAssessment: vi.fn(),
  publishAssessment: vi.fn(),
}));
vi.mock("../../lib/schoolConfigApi.js", () => ({
  listClassrooms: vi.fn(),
  listAcademicYears: vi.fn(),
  listSubjects: vi.fn(),
}));
vi.mock("../../lib/studentsApi.js", () => ({ listStudents: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  role.codes = ["SCHOOL_ADMIN"];
});
it("rend la publication accessible au propriétaire au-dessus du large tableau", async () => {
  role.codes = ["SCHOOL_OWNER"];
  vi.mocked(listClassrooms).mockResolvedValue([{ id: "c", name: "3e A", academicYearId: "y" }] as never);
  vi.mocked(listAcademicYears).mockResolvedValue([{ id: "y", isCurrent: true }] as never);
  vi.mocked(listStudents).mockResolvedValue([]);
  vi.mocked(listSubjects).mockResolvedValue([]);
  let published = false;
  vi.mocked(listAssessments).mockImplementation(() =>
    Promise.resolve([{ id: "a", title: "Contrôle", isPublished: published, maxScore: "20" }] as never),
  );
  vi.mocked(listGradesForAssessment).mockResolvedValue([]);
  vi.mocked(publishAssessment).mockImplementation(() => {
    published = true;
    return Promise.resolve({} as never);
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SchoolClassReview kind="grades" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Publier Contrôle" }));
  expect(
    await screen.findByText("Toutes les évaluations de cette classe sont publiées."),
  ).toBeInTheDocument();
  expect(publishAssessment).toHaveBeenCalledWith("a", { accessToken: "admin", subdomain: "school" });
});
it("affiche la classe choisie en consultation sans formulaire de saisie", async () => {
  vi.mocked(listClassrooms).mockResolvedValue(
    ["c1", "c2"].map((id, i) => ({
      id,
      name: i ? "4e A" : "3e A",
      academicYearId: "y",
      campusId: "p",
      gradeLevelId: "g",
      capacity: 30,
    })),
  );
  vi.mocked(listAcademicYears).mockResolvedValue([
    { id: "y", name: "2026", isCurrent: true, startDate: "2026-09-01", endDate: "2027-06-30" },
  ]);
  vi.mocked(listStudents).mockResolvedValue([]);
  vi.mocked(listAttendance).mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SchoolClassReview kind="attendance" />
    </QueryClientProvider>,
  );
  await screen.findByRole("option", { name: "4e A" });
  fireEvent.change(screen.getByRole("combobox", { name: "Classe" }), { target: { value: "c2" } });
  await waitFor(() =>
    expect(listAttendance).toHaveBeenCalledWith(
      { accessToken: "admin", subdomain: "school" },
      expect.objectContaining({ classroomId: "c2" }),
    ),
  );
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
