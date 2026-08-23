import type { ReportCard, ReportCardItem } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { GenerateReportCardsInput, ListReportCardsQuery } from "./report-card.validation.js";

export type ReportCardWithItems = ReportCard & { items: ReportCardItem[] };

/**
 * Hardcoded MVP defaults (§21 asks for a per-tenant configurable scale, rounding,
 * pass mark and mentions — that needs a TenantSetting-backed service that doesn't
 * exist yet, same gap as the duplicate-detection config in §19). All averages are
 * normalized to /20 regardless of each assessment's own maxScore.
 */
const NORMALIZED_SCALE = 20;
const MENTION_THRESHOLDS: readonly [number, string][] = [
  [16, "Très bien"],
  [14, "Bien"],
  [12, "Assez bien"],
  [10, "Passable"],
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mentionFor(average: number | null): string | null {
  if (average === null) {
    return null;
  }
  return MENTION_THRESHOLDS.find(([threshold]) => average >= threshold)?.[1] ?? null;
}

async function studentIdsEnrolledInClassroom(classroomId: string, academicYearId: string): Promise<string[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      classroomId,
      academicYearId,
      deletedAt: null,
      status: { in: ["ENROLLED", "RE_ENROLLED"] },
    },
    select: { studentId: true },
  });
  return enrollments.map((e) => e.studentId);
}

/**
 * Regenerating for the whole classroom at once (rather than one student at a time) is
 * deliberate: class rank only means something computed across every student together.
 */
export async function generateReportCards(input: GenerateReportCardsInput): Promise<ReportCardWithItems[]> {
  const classroom = await prisma.classroom.findUnique({ where: { id: input.classroomId } });
  if (!classroom || classroom.deletedAt) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }
  const academicPeriod = await prisma.academicPeriod.findUnique({ where: { id: input.academicPeriodId } });
  if (!academicPeriod) {
    throw new AppError(
      404,
      "ACADEMIC_PERIOD_NOT_FOUND",
      `Academic period not found: ${input.academicPeriodId}`,
    );
  }
  if (classroom.academicYearId !== academicPeriod.academicYearId) {
    throw new AppError(
      400,
      "CLASSROOM_PERIOD_YEAR_MISMATCH",
      "Classroom and academic period do not belong to the same academic year",
    );
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classroomId: input.classroomId,
      academicYearId: academicPeriod.academicYearId,
      deletedAt: null,
      status: { in: ["ENROLLED", "RE_ENROLLED"] },
    },
  });
  if (enrollments.length === 0) {
    throw new AppError(400, "NO_ENROLLED_STUDENTS", "This classroom has no actively enrolled students");
  }

  const assessments = await prisma.assessment.findMany({
    where: { classroomId: input.classroomId, academicPeriodId: input.academicPeriodId, deletedAt: null },
  });
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));

  const grades = await prisma.grade.findMany({
    where: { assessmentId: { in: assessments.map((a) => a.id) } },
  });

  const gradeLevelIds = [...new Set(enrollments.map((e) => e.gradeLevelId))];
  const subjectIds = [...new Set(assessments.map((a) => a.subjectId))];
  const subjectCoefficients = await prisma.subjectCoefficient.findMany({
    where: { subjectId: { in: subjectIds }, gradeLevelId: { in: gradeLevelIds } },
  });
  const subjectCoefficientMap = new Map(
    subjectCoefficients.map((c) => [`${c.subjectId}:${c.gradeLevelId}`, c.coefficient.toNumber()]),
  );

  // studentId -> subjectId -> { weightedSum, coefficientSum }
  const perStudentSubject = new Map<string, Map<string, { weightedSum: number; coefficientSum: number }>>();
  for (const grade of grades) {
    if (grade.isAbsent || grade.score === null) {
      continue;
    }
    const assessment = assessmentById.get(grade.assessmentId);
    if (!assessment) {
      continue;
    }
    const normalized = (grade.score.toNumber() / assessment.maxScore.toNumber()) * NORMALIZED_SCALE;
    const coefficient = assessment.coefficient.toNumber();

    const bySubject =
      perStudentSubject.get(grade.studentId) ??
      new Map<string, { weightedSum: number; coefficientSum: number }>();
    const entry = bySubject.get(assessment.subjectId) ?? { weightedSum: 0, coefficientSum: 0 };
    entry.weightedSum += normalized * coefficient;
    entry.coefficientSum += coefficient;
    bySubject.set(assessment.subjectId, entry);
    perStudentSubject.set(grade.studentId, bySubject);
  }

  interface Computed {
    studentId: string;
    overallAverage: number | null;
    subjectAverages: { subjectId: string; averageScore: number; coefficient: number }[];
  }

  const computed: Computed[] = enrollments.map((enrollment) => {
    const bySubject = perStudentSubject.get(enrollment.studentId);
    const subjectAverages: Computed["subjectAverages"] = [];
    let weightedSum = 0;
    let coefficientSum = 0;

    if (bySubject) {
      for (const [
        subjectId,
        { weightedSum: subjectWeightedSum, coefficientSum: subjectCoefficientSum },
      ] of bySubject) {
        if (subjectCoefficientSum === 0) {
          continue;
        }
        const subjectAverage = round2(subjectWeightedSum / subjectCoefficientSum);
        const subjectCoefficient = subjectCoefficientMap.get(`${subjectId}:${enrollment.gradeLevelId}`) ?? 1;
        subjectAverages.push({ subjectId, averageScore: subjectAverage, coefficient: subjectCoefficient });
        weightedSum += subjectAverage * subjectCoefficient;
        coefficientSum += subjectCoefficient;
      }
    }

    return {
      studentId: enrollment.studentId,
      overallAverage: coefficientSum > 0 ? round2(weightedSum / coefficientSum) : null,
      subjectAverages,
    };
  });

  const ranked = [...computed]
    .filter((c) => c.overallAverage !== null)
    .sort((a, b) => (b.overallAverage as number) - (a.overallAverage as number));
  const rankByStudentId = new Map<string, number>();
  let rank = 0;
  let previousAverage: number | null = null;
  ranked.forEach((entry, index) => {
    if (entry.overallAverage !== previousAverage) {
      rank = index + 1;
      previousAverage = entry.overallAverage;
    }
    rankByStudentId.set(entry.studentId, rank);
  });

  const tenantId = requireCurrentTenantId();
  const results: ReportCardWithItems[] = [];
  // §2/§37 : ReportCardItem n'a pas de tenantId propre — sa politique RLS vérifie le
  // tenant du ReportCard parent par sous-requête, ce qui exige que app.tenant_id soit
  // déjà positionné quand Postgres l'évalue. withTenantSession le garantit pour tout
  // ce bloc, y compris le upsert de ReportCard lui-même (fait ici via `tx`, hors garde
  // applicative, tenantId posé explicitement en création comme requis).
  for (const entry of computed) {
    const { reportCard, items } = await withTenantSession(tenantId, async (tx) => {
      const card = await tx.reportCard.upsert({
        where: {
          studentId_academicPeriodId: {
            studentId: entry.studentId,
            academicPeriodId: input.academicPeriodId,
          },
        },
        update: {
          generatedAt: new Date(),
          averageScore: entry.overallAverage,
          classRank: rankByStudentId.get(entry.studentId) ?? null,
          mention: mentionFor(entry.overallAverage),
        },
        create: {
          tenantId,
          studentId: entry.studentId,
          academicPeriodId: input.academicPeriodId,
          averageScore: entry.overallAverage,
          classRank: rankByStudentId.get(entry.studentId) ?? null,
          mention: mentionFor(entry.overallAverage),
        },
      });

      await tx.reportCardItem.deleteMany({ where: { reportCardId: card.id } });
      if (entry.subjectAverages.length > 0) {
        await tx.reportCardItem.createMany({
          data: entry.subjectAverages.map((s) => ({
            reportCardId: card.id,
            subjectId: s.subjectId,
            averageScore: s.averageScore,
            coefficient: s.coefficient,
          })),
        });
      }

      const cardItems = await tx.reportCardItem.findMany({ where: { reportCardId: card.id } });
      return { reportCard: card, items: cardItems };
    });

    results.push({ ...reportCard, items });
  }

  return results;
}

export async function listReportCards(query: ListReportCardsQuery): Promise<ReportCard[]> {
  let studentIdFilter: string[] | undefined;
  if (query.classroomId) {
    const academicPeriod = query.academicPeriodId
      ? await prisma.academicPeriod.findUnique({ where: { id: query.academicPeriodId } })
      : null;
    studentIdFilter = academicPeriod
      ? await studentIdsEnrolledInClassroom(query.classroomId, academicPeriod.academicYearId)
      : [];
  }

  return prisma.reportCard.findMany({
    where: {
      ...(query.academicPeriodId ? { academicPeriodId: query.academicPeriodId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(studentIdFilter ? { studentId: { in: studentIdFilter } } : {}),
    },
    orderBy: [{ classRank: "asc" }],
  });
}

export async function requireReportCard(id: string): Promise<ReportCardWithItems> {
  const reportCard = await prisma.reportCard.findUnique({ where: { id }, include: { items: true } });
  if (!reportCard) {
    throw new AppError(404, "REPORT_CARD_NOT_FOUND", `Report card not found: ${id}`);
  }
  return reportCard;
}
