import type { Expense } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { requireExpenseCategory } from "./expense-category.service.js";
import type { CreateExpenseInput, ListExpensesQuery, UpdateExpenseInput } from "./expense.validation.js";

export async function createExpense(input: CreateExpenseInput, actingUserId: string): Promise<Expense> {
  await requireExpenseCategory(input.categoryId);
  const approvedByEmployeeId = await resolveActingEmployeeId(actingUserId);

  return prisma.expense.create({
    data: {
      tenantId: requireCurrentTenantId(),
      categoryId: input.categoryId,
      description: input.description,
      amountCents: input.amountCents,
      expenseDate: input.expenseDate,
      ...(input.supplierName ? { supplierName: input.supplierName } : {}),
      ...(approvedByEmployeeId ? { approvedByEmployeeId } : {}),
    },
  });
}

export async function listExpenses(query: ListExpensesQuery): Promise<Expense[]> {
  return prisma.expense.findMany({
    where: {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.startDate || query.endDate
        ? {
            expenseDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { expenseDate: "desc" },
  });
}

async function requireExpense(id: string): Promise<Expense> {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense || expense.deletedAt) {
    throw new AppError(404, "EXPENSE_NOT_FOUND", `Expense not found: ${id}`);
  }
  return expense;
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<Expense> {
  await requireExpense(id);
  if (input.categoryId) {
    await requireExpenseCategory(input.categoryId);
  }

  return prisma.expense.update({
    where: { id },
    data: {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.supplierName !== undefined ? { supplierName: input.supplierName } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
    },
  });
}

export async function removeExpense(id: string): Promise<void> {
  await requireExpense(id);
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
}
