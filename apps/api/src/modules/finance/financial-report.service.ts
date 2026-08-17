import { prisma } from "../../lib/prisma.js";

import type { FinancialReportQuery } from "./financial-report.validation.js";

export interface FinancialReportBreakdown {
  key: string;
  label: string;
  amountCents: number;
}

export interface RevenueReport {
  startDate: Date;
  endDate: Date;
  paymentCount: number;
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  byMethod: FinancialReportBreakdown[];
  byDay: FinancialReportBreakdown[];
}

export interface ExpenseReport {
  startDate: Date;
  endDate: Date;
  expenseCount: number;
  totalExpensesCents: number;
  byCategory: FinancialReportBreakdown[];
  byDay: FinancialReportBreakdown[];
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sortedBreakdown(map: Map<string, FinancialReportBreakdown>): FinancialReportBreakdown[] {
  return [...map.values()].sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * §23 "rapports de recettes" — agrégé en mémoire (même style que
 * stats-admin.service.ts, §31 tranche 9) : le volume par tenant/période reste
 * largement en dessous de ce qui justifierait un GROUP BY SQL dédié. Un remboursement
 * compte sur sa propre date (`refundedAt`), pas sur celle du paiement d'origine —
 * cohérence comptable période par période plutôt que de retoucher un mois déjà clos.
 */
export async function getRevenueReport(query: FinancialReportQuery): Promise<RevenueReport> {
  const range = { gte: query.startDate, lte: endOfDay(query.endDate) };

  const [payments, refunds] = await Promise.all([
    prisma.studentPayment.findMany({ where: { paidAt: range } }),
    prisma.studentPaymentRefund.findMany({ where: { refundedAt: range } }),
  ]);

  const grossRevenueCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const refundedCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0);

  const byMethod = new Map<string, FinancialReportBreakdown>();
  const byDay = new Map<string, FinancialReportBreakdown>();
  for (const payment of payments) {
    const methodEntry = byMethod.get(payment.method);
    byMethod.set(payment.method, {
      key: payment.method,
      label: payment.method,
      amountCents: (methodEntry?.amountCents ?? 0) + payment.amountCents,
    });

    const key = dayKey(payment.paidAt);
    const dayEntry = byDay.get(key);
    byDay.set(key, { key, label: key, amountCents: (dayEntry?.amountCents ?? 0) + payment.amountCents });
  }

  return {
    startDate: query.startDate,
    endDate: query.endDate,
    paymentCount: payments.length,
    grossRevenueCents,
    refundedCents,
    netRevenueCents: grossRevenueCents - refundedCents,
    byMethod: sortedBreakdown(byMethod),
    byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/** §23 "rapports de dépenses" — même approche que getRevenueReport ci-dessus. */
export async function getExpenseReport(query: FinancialReportQuery): Promise<ExpenseReport> {
  const range = { gte: query.startDate, lte: endOfDay(query.endDate) };

  const expenses = await prisma.expense.findMany({
    where: { expenseDate: range, deletedAt: null },
    include: { category: true },
  });

  const totalExpensesCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  const byCategory = new Map<string, FinancialReportBreakdown>();
  const byDay = new Map<string, FinancialReportBreakdown>();
  for (const expense of expenses) {
    const categoryEntry = byCategory.get(expense.categoryId);
    byCategory.set(expense.categoryId, {
      key: expense.categoryId,
      label: expense.category.nameFr,
      amountCents: (categoryEntry?.amountCents ?? 0) + expense.amountCents,
    });

    const key = dayKey(expense.expenseDate);
    const dayEntry = byDay.get(key);
    byDay.set(key, { key, label: key, amountCents: (dayEntry?.amountCents ?? 0) + expense.amountCents });
  }

  return {
    startDate: query.startDate,
    endDate: query.endDate,
    expenseCount: expenses.length,
    totalExpensesCents,
    byCategory: sortedBreakdown(byCategory),
    byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
