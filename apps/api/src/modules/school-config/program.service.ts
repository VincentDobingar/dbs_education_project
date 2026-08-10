import type { Program } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateProgramInput, ListProgramsQuery, UpdateProgramInput } from "./program.validation.js";

async function requireGradeLevel(id: string): Promise<void> {
  const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id } });
  if (!gradeLevel) {
    throw new AppError(404, "GRADE_LEVEL_NOT_FOUND", `Grade level not found: ${id}`);
  }
}

export async function createProgram(input: CreateProgramInput): Promise<Program> {
  const existing = await prisma.program.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "PROGRAM_CODE_TAKEN", `Program code already in use: ${input.code}`);
  }

  if (input.gradeLevelId) {
    await requireGradeLevel(input.gradeLevelId);
  }

  return prisma.program.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      ...(input.gradeLevelId ? { gradeLevelId: input.gradeLevelId } : {}),
    },
  });
}

export async function listPrograms(query: ListProgramsQuery): Promise<Program[]> {
  return prisma.program.findMany({
    where: { ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}) },
    orderBy: { nameFr: "asc" },
  });
}

export async function updateProgram(id: string, input: UpdateProgramInput): Promise<Program> {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    throw new AppError(404, "PROGRAM_NOT_FOUND", `Program not found: ${id}`);
  }

  if (input.gradeLevelId) {
    await requireGradeLevel(input.gradeLevelId);
  }

  return prisma.program.update({
    where: { id },
    data: {
      ...(input.nameFr !== undefined ? { nameFr: input.nameFr } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.gradeLevelId !== undefined ? { gradeLevelId: input.gradeLevelId } : {}),
    },
  });
}
