import type { AcademicPeriod, AcademicYear } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CreateAcademicPeriodInput,
  CreateAcademicYearInput,
  UpdateAcademicYearInput,
} from "./academic-year.validation.js";

export async function createAcademicYear(input: CreateAcademicYearInput): Promise<AcademicYear> {
  if (input.endDate <= input.startDate) {
    throw new AppError(400, "INVALID_DATE_RANGE", "endDate must be after startDate");
  }

  const existing = await prisma.academicYear.findFirst({ where: { name: input.name } });
  if (existing) {
    throw new AppError(409, "ACADEMIC_YEAR_NAME_TAKEN", `Academic year already exists: ${input.name}`);
  }

  return prisma.academicYear.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  return prisma.academicYear.findMany({ where: { deletedAt: null }, orderBy: { startDate: "desc" } });
}

async function requireAcademicYear(id: string): Promise<AcademicYear> {
  const year = await prisma.academicYear.findUnique({ where: { id } });
  if (!year || year.deletedAt) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${id}`);
  }
  return year;
}

export async function updateAcademicYear(id: string, input: UpdateAcademicYearInput): Promise<AcademicYear> {
  const year = await requireAcademicYear(id);

  const startDate = input.startDate ?? year.startDate;
  const endDate = input.endDate ?? year.endDate;
  if (endDate <= startDate) {
    throw new AppError(400, "INVALID_DATE_RANGE", "endDate must be after startDate");
  }

  return prisma.academicYear.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    },
  });
}

/** Exactly one AcademicYear may be "current" per tenant at a time (§20). */
export async function setCurrentAcademicYear(id: string): Promise<AcademicYear> {
  await requireAcademicYear(id);

  await prisma.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
  return prisma.academicYear.update({ where: { id }, data: { isCurrent: true } });
}

export async function createAcademicPeriod(
  academicYearId: string,
  input: CreateAcademicPeriodInput,
): Promise<AcademicPeriod> {
  await requireAcademicYear(academicYearId);

  if (input.endDate <= input.startDate) {
    throw new AppError(400, "INVALID_DATE_RANGE", "endDate must be after startDate");
  }

  const existing = await prisma.academicPeriod.findFirst({
    where: { academicYearId, sequence: input.sequence },
  });
  if (existing) {
    throw new AppError(
      409,
      "PERIOD_SEQUENCE_TAKEN",
      `A period with sequence ${input.sequence} already exists for this academic year`,
    );
  }

  return prisma.academicPeriod.create({
    data: {
      tenantId: requireCurrentTenantId(),
      academicYearId,
      name: input.name,
      type: input.type,
      sequence: input.sequence,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });
}

export async function listAcademicPeriods(academicYearId: string): Promise<AcademicPeriod[]> {
  await requireAcademicYear(academicYearId);
  return prisma.academicPeriod.findMany({ where: { academicYearId }, orderBy: { sequence: "asc" } });
}
