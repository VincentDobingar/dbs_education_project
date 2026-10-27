import type { FeeCategory, FeeStructure } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { requireFeeCategory } from "./fee-category.service.js";
import type {
  CreateFeeStructureInput,
  ListFeeStructuresQuery,
  UpdateFeeStructureInput,
} from "./fee-structure.validation.js";

export async function createFeeStructure(input: CreateFeeStructureInput): Promise<FeeStructure> {
  const academicYear = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!academicYear) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${input.academicYearId}`);
  }
  await requireFeeCategory(input.feeCategoryId);
  if (input.gradeLevelId) {
    const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id: input.gradeLevelId } });
    if (!gradeLevel) {
      throw new AppError(404, "GRADE_LEVEL_NOT_FOUND", `Grade level not found: ${input.gradeLevelId}`);
    }
  }

  if (input.programId) {
    const program = await prisma.program.findUnique({ where: { id: input.programId } });
    if (!program) {
      throw new AppError(404, "PROGRAM_NOT_FOUND", `Program not found: ${input.programId}`);
    }
  }

  return prisma.feeStructure.create({
    data: {
      tenantId: requireCurrentTenantId(),
      academicYearId: input.academicYearId,
      feeCategoryId: input.feeCategoryId,
      amountCents: input.amountCents,
      ...(input.gradeLevelId ? { gradeLevelId: input.gradeLevelId } : {}),
      ...(input.programId ? { programId: input.programId } : {}),
      ...(input.studentType ? { studentType: input.studentType } : {}),
      ...(input.dueWithInstallment ? { dueWithInstallment: input.dueWithInstallment } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.isMandatory !== undefined ? { isMandatory: input.isMandatory } : {}),
    },
  });
}

export async function listFeeStructures(
  query: ListFeeStructuresQuery,
): Promise<(FeeStructure & { feeCategory: FeeCategory })[]> {
  return prisma.feeStructure.findMany({
    include: { feeCategory: true },
    where: {
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
      ...(query.feeCategoryId ? { feeCategoryId: query.feeCategoryId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function requireFeeStructure(id: string): Promise<FeeStructure> {
  const feeStructure = await prisma.feeStructure.findUnique({ where: { id } });
  if (!feeStructure) {
    throw new AppError(404, "FEE_STRUCTURE_NOT_FOUND", `Fee structure not found: ${id}`);
  }
  return feeStructure;
}

export async function updateFeeStructure(id: string, input: UpdateFeeStructureInput): Promise<FeeStructure> {
  await requireFeeStructure(id);

  return prisma.feeStructure.update({
    where: { id },
    data: {
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.isMandatory !== undefined ? { isMandatory: input.isMandatory } : {}),
      ...(input.studentType !== undefined ? { studentType: input.studentType } : {}),
      ...(input.dueWithInstallment !== undefined ? { dueWithInstallment: input.dueWithInstallment } : {}),
    },
  });
}

/** Retirer un tarif de la grille n'affecte aucun contrat déjà signé (photographie figée). */
export async function deleteFeeStructure(id: string): Promise<void> {
  await requireFeeStructure(id);
  await prisma.feeStructure.delete({ where: { id } });
}
