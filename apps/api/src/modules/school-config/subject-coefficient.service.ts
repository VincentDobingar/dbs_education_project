import type { SubjectCoefficient } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { SetSubjectCoefficientInput } from "./subject-coefficient.validation.js";

async function requireSubject(id: string): Promise<void> {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${id}`);
  }
}

async function requireGradeLevel(id: string): Promise<void> {
  const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id } });
  if (!gradeLevel) {
    throw new AppError(404, "GRADE_LEVEL_NOT_FOUND", `Grade level not found: ${id}`);
  }
}

/**
 * A subject can have at most one coefficient per grade level (unique constraint), so
 * setting it again for the same pair updates the existing value rather than conflicting.
 */
export async function setSubjectCoefficient(
  subjectId: string,
  input: SetSubjectCoefficientInput,
): Promise<SubjectCoefficient> {
  await requireSubject(subjectId);
  await requireGradeLevel(input.gradeLevelId);

  return prisma.subjectCoefficient.upsert({
    where: { subjectId_gradeLevelId: { subjectId, gradeLevelId: input.gradeLevelId } },
    update: { coefficient: input.coefficient },
    create: {
      tenantId: requireCurrentTenantId(),
      subjectId,
      gradeLevelId: input.gradeLevelId,
      coefficient: input.coefficient,
    },
  });
}

export async function listSubjectCoefficients(subjectId: string): Promise<SubjectCoefficient[]> {
  await requireSubject(subjectId);
  return prisma.subjectCoefficient.findMany({
    where: { subjectId },
    orderBy: { createdAt: "asc" },
  });
}

export async function removeSubjectCoefficient(id: string): Promise<void> {
  const coefficient = await prisma.subjectCoefficient.findUnique({ where: { id } });
  if (!coefficient) {
    throw new AppError(404, "SUBJECT_COEFFICIENT_NOT_FOUND", `Subject coefficient not found: ${id}`);
  }
  await prisma.subjectCoefficient.delete({ where: { id } });
}
