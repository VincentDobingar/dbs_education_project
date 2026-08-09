import type { Campus } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateCampusInput, UpdateCampusInput } from "./campus.validation.js";

/** At most one campus is "main" per tenant — enforced here, not by a DB constraint. */
async function clearOtherMainCampuses(exceptCampusId?: string): Promise<void> {
  await prisma.campus.updateMany({
    where: { isMain: true, ...(exceptCampusId ? { id: { not: exceptCampusId } } : {}) },
    data: { isMain: false },
  });
}

export async function createCampus(input: CreateCampusInput): Promise<Campus> {
  const existing = await prisma.campus.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "CAMPUS_CODE_TAKEN", `Campus code already in use: ${input.code}`);
  }

  if (input.isMain) {
    await clearOtherMainCampuses();
  }

  return prisma.campus.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      code: input.code,
      ...(input.address ? { address: input.address } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
    },
  });
}

export async function listCampuses(): Promise<Campus[]> {
  return prisma.campus.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
}

export async function updateCampus(id: string, input: UpdateCampusInput): Promise<Campus> {
  const campus = await prisma.campus.findUnique({ where: { id } });
  if (!campus || campus.deletedAt) {
    throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${id}`);
  }

  if (input.code && input.code !== campus.code) {
    const existing = await prisma.campus.findFirst({ where: { code: input.code } });
    if (existing) {
      throw new AppError(409, "CAMPUS_CODE_TAKEN", `Campus code already in use: ${input.code}`);
    }
  }

  if (input.isMain) {
    await clearOtherMainCampuses(id);
  }

  return prisma.campus.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
    },
  });
}
