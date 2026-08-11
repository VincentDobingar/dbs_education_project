import type { ExpenseCategory } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateExpenseCategoryInput } from "./expense-category.validation.js";

export async function createExpenseCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory> {
  const existing = await prisma.expenseCategory.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(
      409,
      "EXPENSE_CATEGORY_CODE_TAKEN",
      `Expense category code already in use: ${input.code}`,
    );
  }

  return prisma.expenseCategory.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
    },
  });
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  return prisma.expenseCategory.findMany({ orderBy: { nameFr: "asc" } });
}

export async function requireExpenseCategory(id: string): Promise<ExpenseCategory> {
  const category = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!category) {
    throw new AppError(404, "EXPENSE_CATEGORY_NOT_FOUND", `Expense category not found: ${id}`);
  }
  return category;
}
