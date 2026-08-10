import type { Grade } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import { requireAssessment } from "./assessment.service.js";
import type { CorrectGradeInput, ListStudentGradesQuery, SetGradesInput } from "./grade.validation.js";

/** Never trust a client-supplied employee id for "who entered this grade" (same principle as document uploads). */
async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId } });
  return employee?.id;
}

export async function setGrades(
  assessmentId: string,
  input: SetGradesInput,
  actingUserId: string,
): Promise<Grade[]> {
  const assessment = await requireAssessment(assessmentId);
  if (assessment.isPublished) {
    throw new AppError(
      409,
      "ASSESSMENT_LOCKED",
      "This assessment is published; use the correction endpoint to change a grade",
    );
  }

  const enteredByEmployeeId = await resolveActingEmployeeId(actingUserId);
  const tenantId = requireCurrentTenantId();
  const maxScore = assessment.maxScore.toNumber();

  const results: Grade[] = [];
  for (const entry of input.grades) {
    await requireStudentRecord(entry.studentId);
    if (!entry.isAbsent && entry.score !== undefined && entry.score > maxScore) {
      throw new AppError(
        400,
        "SCORE_EXCEEDS_MAX",
        `Score ${entry.score} exceeds the assessment's max score of ${maxScore}`,
      );
    }

    const score = entry.isAbsent ? null : (entry.score ?? null);
    const grade = await prisma.grade.upsert({
      where: { assessmentId_studentId: { assessmentId, studentId: entry.studentId } },
      update: {
        score,
        isAbsent: entry.isAbsent,
        comment: entry.comment ?? null,
        ...(enteredByEmployeeId ? { enteredByEmployeeId } : {}),
      },
      create: {
        tenantId,
        assessmentId,
        studentId: entry.studentId,
        score,
        isAbsent: entry.isAbsent,
        ...(entry.comment ? { comment: entry.comment } : {}),
        ...(enteredByEmployeeId ? { enteredByEmployeeId } : {}),
      },
    });
    results.push(grade);
  }

  return results;
}

export async function listGradesForAssessment(assessmentId: string): Promise<Grade[]> {
  await requireAssessment(assessmentId);
  return prisma.grade.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } });
}

export async function listGradesForStudent(
  studentId: string,
  query: ListStudentGradesQuery,
): Promise<Grade[]> {
  await requireStudentRecord(studentId);
  return prisma.grade.findMany({
    where: {
      studentId,
      ...(query.academicPeriodId ? { assessment: { academicPeriodId: query.academicPeriodId } } : {}),
    },
    include: { assessment: true },
    orderBy: { createdAt: "asc" },
  });
}

async function requireGrade(id: string): Promise<Grade> {
  const grade = await prisma.grade.findUnique({ where: { id } });
  if (!grade) {
    throw new AppError(404, "GRADE_NOT_FOUND", `Grade not found: ${id}`);
  }
  return grade;
}

/**
 * Always allowed regardless of lock state, and always logged (§21: corrections
 * autorisées + historique des modifications) — a deliberately more privileged path
 * than the normal bulk-entry endpoint, which refuses once the assessment is published.
 */
export async function correctGrade(
  id: string,
  input: CorrectGradeInput,
  actingUserId: string,
): Promise<Grade> {
  const grade = await requireGrade(id);
  const assessment = await requireAssessment(grade.assessmentId);

  const isAbsent = input.isAbsent ?? grade.isAbsent;
  if (!isAbsent && input.score !== undefined && input.score > assessment.maxScore.toNumber()) {
    throw new AppError(
      400,
      "SCORE_EXCEEDS_MAX",
      `Score ${input.score} exceeds the assessment's max score of ${assessment.maxScore.toNumber()}`,
    );
  }

  const previousScore = grade.score;
  const newScore = isAbsent ? null : (input.score ?? grade.score?.toNumber() ?? null);

  const updated = await prisma.grade.update({
    where: { id },
    data: { score: newScore, isAbsent },
  });

  await prisma.gradeChangeLog.create({
    data: {
      gradeId: id,
      previousScore,
      newScore,
      changedByUserId: actingUserId,
      reason: input.reason,
    },
  });

  return updated;
}
