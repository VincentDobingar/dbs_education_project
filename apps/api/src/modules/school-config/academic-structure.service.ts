import type { Classroom, EducationCycle, GradeLevel } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CreateClassroomInput,
  CreateEducationCycleInput,
  CreateGradeLevelInput,
  UpdateClassroomInput,
} from "./academic-structure.validation.js";

export async function createEducationCycle(input: CreateEducationCycleInput): Promise<EducationCycle> {
  const existing = await prisma.educationCycle.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "CYCLE_CODE_TAKEN", `Education cycle code already in use: ${input.code}`);
  }

  return prisma.educationCycle.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      order: input.order,
    },
  });
}

export async function listEducationCycles(): Promise<EducationCycle[]> {
  return prisma.educationCycle.findMany({ orderBy: { order: "asc" } });
}

async function requireEducationCycle(id: string): Promise<EducationCycle> {
  const cycle = await prisma.educationCycle.findUnique({ where: { id } });
  if (!cycle) {
    throw new AppError(404, "CYCLE_NOT_FOUND", `Education cycle not found: ${id}`);
  }
  return cycle;
}

export async function createGradeLevel(cycleId: string, input: CreateGradeLevelInput): Promise<GradeLevel> {
  await requireEducationCycle(cycleId);

  const existing = await prisma.gradeLevel.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "GRADE_LEVEL_CODE_TAKEN", `Grade level code already in use: ${input.code}`);
  }

  return prisma.gradeLevel.create({
    data: {
      tenantId: requireCurrentTenantId(),
      cycleId,
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      order: input.order,
    },
  });
}

export async function listGradeLevels(cycleId?: string): Promise<GradeLevel[]> {
  return prisma.gradeLevel.findMany({
    where: cycleId ? { cycleId } : {},
    orderBy: { order: "asc" },
  });
}

async function requireGradeLevel(id: string): Promise<GradeLevel> {
  const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id } });
  if (!gradeLevel) {
    throw new AppError(404, "GRADE_LEVEL_NOT_FOUND", `Grade level not found: ${id}`);
  }
  return gradeLevel;
}

export async function createClassroom(input: CreateClassroomInput): Promise<Classroom> {
  const [academicYear, campus] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
    prisma.campus.findUnique({ where: { id: input.campusId } }),
  ]);
  if (!academicYear) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${input.academicYearId}`);
  }
  if (!campus) {
    throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
  }
  await requireGradeLevel(input.gradeLevelId);

  const existing = await prisma.classroom.findFirst({
    where: { academicYearId: input.academicYearId, name: input.name },
  });
  if (existing) {
    throw new AppError(
      409,
      "CLASSROOM_NAME_TAKEN",
      `A classroom named "${input.name}" already exists for this year`,
    );
  }

  return prisma.classroom.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      academicYearId: input.academicYearId,
      campusId: input.campusId,
      gradeLevelId: input.gradeLevelId,
      ...(input.programId ? { programId: input.programId } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.mainTeacherId ? { mainTeacherId: input.mainTeacherId } : {}),
    },
  });
}

export async function listClassrooms(academicYearId?: string): Promise<Classroom[]> {
  return prisma.classroom.findMany({
    where: { deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function updateClassroom(id: string, input: UpdateClassroomInput): Promise<Classroom> {
  const classroom = await prisma.classroom.findUnique({ where: { id } });
  if (!classroom || classroom.deletedAt) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${id}`);
  }

  return prisma.classroom.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.mainTeacherId !== undefined ? { mainTeacherId: input.mainTeacherId } : {}),
    },
  });
}
