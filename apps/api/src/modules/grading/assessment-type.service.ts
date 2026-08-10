import type { AssessmentType } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateAssessmentTypeInput } from "./assessment-type.validation.js";

export async function createAssessmentType(input: CreateAssessmentTypeInput): Promise<AssessmentType> {
  const existing = await prisma.assessmentType.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(
      409,
      "ASSESSMENT_TYPE_CODE_TAKEN",
      `Assessment type code already in use: ${input.code}`,
    );
  }

  return prisma.assessmentType.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
    },
  });
}

export async function listAssessmentTypes(): Promise<AssessmentType[]> {
  return prisma.assessmentType.findMany({ orderBy: { nameFr: "asc" } });
}

export async function requireAssessmentType(id: string): Promise<AssessmentType> {
  const assessmentType = await prisma.assessmentType.findUnique({ where: { id } });
  if (!assessmentType) {
    throw new AppError(404, "ASSESSMENT_TYPE_NOT_FOUND", `Assessment type not found: ${id}`);
  }
  return assessmentType;
}
