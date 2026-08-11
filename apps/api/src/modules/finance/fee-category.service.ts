import type { FeeCategory } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateFeeCategoryInput } from "./fee-category.validation.js";

export async function createFeeCategory(input: CreateFeeCategoryInput): Promise<FeeCategory> {
  const existing = await prisma.feeCategory.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "FEE_CATEGORY_CODE_TAKEN", `Fee category code already in use: ${input.code}`);
  }

  return prisma.feeCategory.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
    },
  });
}

export async function listFeeCategories(): Promise<FeeCategory[]> {
  return prisma.feeCategory.findMany({ orderBy: { nameFr: "asc" } });
}

export async function requireFeeCategory(id: string): Promise<FeeCategory> {
  const feeCategory = await prisma.feeCategory.findUnique({ where: { id } });
  if (!feeCategory) {
    throw new AppError(404, "FEE_CATEGORY_NOT_FOUND", `Fee category not found: ${id}`);
  }
  return feeCategory;
}
