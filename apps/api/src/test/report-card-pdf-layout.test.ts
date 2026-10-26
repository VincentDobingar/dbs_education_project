import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateReportCardPdf } from "../modules/grading/report-card-pdf.service.js";

const fixture = vi.hoisted(() => ({ count: 10, long: false }));
vi.mock("../lib/pdf-letterhead.js", () => ({ fetchTenantLogo: vi.fn().mockResolvedValue(null) }));
vi.mock("../modules/students/student.service.js", () => ({
  getStudent: vi.fn().mockResolvedValue({ id: "s", firstName: "Sara", lastName: "Test", matricule: "TEST" }),
}));
vi.mock("../modules/grading/report-card.service.js", () => ({
  requireReportCard: vi.fn(() =>
    Promise.resolve({
      studentId: "s",
      academicPeriodId: "p",
      generatedAt: new Date("2026-10-23"),
      averageScore: 14,
      classRank: 1,
      mention: "Bien",
      items: Array.from({ length: fixture.count }, (_, index) => ({
        subjectId: String(index),
        averageScore: 14,
        coefficient: 2,
        teacherComment: fixture.long
          ? "Un commentaire pédagogique très détaillé qui exige plusieurs lignes dans la colonne prévue, sans chevauchement ni troncature."
          : "Bon travail",
      })),
    }),
  ),
}));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    academicPeriod: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: "p",
          name: "Trimestre 1",
          academicYearId: "y",
          academicYear: { name: "2026-2027" },
        }),
    },
    enrollment: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          classroomId: "c",
          classroom: { name: "3e A" },
          gradeLevel: { nameFr: "Troisième" },
        }),
      count: vi.fn().mockResolvedValue(1),
    },
    subject: {
      findMany: vi.fn(() =>
        Promise.resolve(
          Array.from({ length: fixture.count }, (_, index) => ({
            id: String(index),
            nameFr: fixture.long
              ? "Matière avec un intitulé pédagogique particulièrement long " + index
              : "Matière " + index,
          })),
        ),
      ),
    },
  },
}));
beforeEach(() => {
  fixture.count = 10;
  fixture.long = false;
});
describe("mise en page du bulletin premium", () => {
  it("garde dix matières sur une page A4 même sans logo", async () => {
    const pdf = await generateReportCardPdf("card", { name: "Ecole Test", logoUrl: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it("pagine les intitulés et appréciations longs sans boucle ni page vide de pied de page", async () => {
    fixture.count = 35;
    fixture.long = true;
    const pdf = await generateReportCardPdf("card", { name: "Ecole Test", logoUrl: null });
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThan(10);
    expect(pdf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
