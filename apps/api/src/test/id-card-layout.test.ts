import { describe, expect, it, vi } from "vitest";

import { prisma } from "../lib/prisma.js";
import { generateClassIdCardsPdf, generateIdCardPdf } from "../modules/students/id-card.service.js";

vi.mock("../modules/students/student.service.js", () => ({
  getStudent: vi.fn(() => ({
    firstName: "Un prénom très long ".repeat(8),
    lastName: "Un nom très long ".repeat(8),
    matricule: "MAT-TEST",
    status: "ACTIVE",
    deletedAt: null,
    photoUrl: null,
    dateOfBirth: new Date("2017-03-12"),
  })),
  requireCurrentEnrollment: vi.fn(() => ({
    classroomId: "class",
    classroomName: "Classe au nom très long ".repeat(8),
    academicYearName: "2026-2027",
  })),
}));
vi.mock("../lib/pdf-letterhead.js", () => ({ fetchTenantLogo: vi.fn(() => null) }));
describe("carte scolaire premium", () => {
  it("conserve une seule carte CR80 même avec des noms longs et sans logo ni photo", async () => {
    const pdf = await generateIdCardPdf("s", {
      name: "Établissement au nom très long ".repeat(8),
      logoUrl: null,
    });
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 242.65 153.07]");
  });
});

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    classroom: { findUnique: vi.fn(() => ({ id: "class", academicYearId: "year", deletedAt: null })) },
    academicYear: { findFirst: vi.fn(() => ({ id: "year" })) },
    enrollment: {
      findMany: vi.fn(() =>
        ["a", "b", "b"].map((id) => ({
          studentId: id,
          student: { firstName: id, lastName: "Test", matricule: id, status: "ACTIVE", deletedAt: null },
        })),
      ),
    },
  },
}));
it("génère une carte par élève de la classe sans doublons", async () => {
  const pdf = await generateClassIdCardsPdf("class", { name: "École Test", logoUrl: null });
  expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(4);
});

it("refuse une classe vide sans produire un PDF vide", async () => {
  vi.mocked(prisma.enrollment.findMany).mockResolvedValueOnce([]);
  await expect(generateClassIdCardsPdf("class", { name: "École Test", logoUrl: null })).rejects.toMatchObject(
    { code: "CLASSROOM_EMPTY" },
  );
});
it("refuse une classe invisible dans le contexte de l'établissement", async () => {
  vi.mocked(prisma.classroom.findUnique).mockResolvedValueOnce(null);
  await expect(
    generateClassIdCardsPdf("foreign", { name: "École Test", logoUrl: null }),
  ).rejects.toMatchObject({ code: "CLASSROOM_NOT_FOUND" });
});
