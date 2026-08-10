import type { Assessment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { requireAssessmentType } from "./assessment-type.service.js";
import type {
  CreateAssessmentInput,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
} from "./assessment.validation.js";

export async function requireAssessment(id: string): Promise<Assessment> {
  const assessment = await prisma.assessment.findUnique({ where: { id } });
  if (!assessment || assessment.deletedAt) {
    throw new AppError(404, "ASSESSMENT_NOT_FOUND", `Assessment not found: ${id}`);
  }
  return assessment;
}

export async function createAssessment(input: CreateAssessmentInput): Promise<Assessment> {
  const [subject, classroom, academicPeriod] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.classroom.findUnique({ where: { id: input.classroomId } }),
    prisma.academicPeriod.findUnique({ where: { id: input.academicPeriodId } }),
  ]);
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${input.subjectId}`);
  }
  if (!classroom) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }
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
  await requireAssessmentType(input.assessmentTypeId);

  return prisma.assessment.create({
    data: {
      tenantId: requireCurrentTenantId(),
      subjectId: input.subjectId,
      classroomId: input.classroomId,
      assessmentTypeId: input.assessmentTypeId,
      academicPeriodId: input.academicPeriodId,
      title: input.title,
      maxScore: input.maxScore,
      ...(input.coefficient !== undefined ? { coefficient: input.coefficient } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
    },
  });
}

export async function listAssessments(query: ListAssessmentsQuery): Promise<Assessment[]> {
  return prisma.assessment.findMany({
    where: {
      deletedAt: null,
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.academicPeriodId ? { academicPeriodId: query.academicPeriodId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateAssessment(id: string, input: UpdateAssessmentInput): Promise<Assessment> {
  const assessment = await requireAssessment(id);
  if (assessment.isPublished) {
    throw new AppError(409, "ASSESSMENT_ALREADY_PUBLISHED", "Cannot edit an assessment once it is published");
  }

  return prisma.assessment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.maxScore !== undefined ? { maxScore: input.maxScore } : {}),
      ...(input.coefficient !== undefined ? { coefficient: input.coefficient } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
    },
  });
}

/**
 * Publishing locks every grade already entered for this assessment (§21: verrouillage
 * après publication) — further corrections must go through the dedicated correction
 * endpoint, which is always logged, rather than the normal bulk-entry path.
 */
export async function publishAssessment(id: string): Promise<Assessment> {
  const assessment = await requireAssessment(id);
  if (assessment.isPublished) {
    throw new AppError(409, "ASSESSMENT_ALREADY_PUBLISHED", "Assessment is already published");
  }

  await prisma.grade.updateMany({ where: { assessmentId: id }, data: { isLocked: true } });
  return prisma.assessment.update({ where: { id }, data: { isPublished: true } });
}
