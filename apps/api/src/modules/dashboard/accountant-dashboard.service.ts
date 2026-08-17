import type { CashSession, StudentInvoiceStatus, StudentPayment } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { getExpenseReport, getRevenueReport } from "../finance/financial-report.service.js";
import type { RevenueReport, ExpenseReport } from "../finance/financial-report.service.js";

import type { DashboardWindowQuery } from "./dashboard.validation.js";

const DEFAULT_WINDOW_DAYS = 30;
const UPCOMING_DUE_DAYS = 7;
const RECENT_PAYMENTS_LIMIT = 10;
const RECENT_CASH_SESSIONS_LIMIT = 5;
const UNPAID_STATUSES = new Set(["ISSUED", "PARTIALLY_PAID"]);

export interface AccountantDashboard {
  windowDays: number;
  today: {
    revenue: RevenueReport;
    recentPayments: StudentPayment[];
  };
  invoices: {
    byStatus: Record<StudentInvoiceStatus, number>;
    unpaidCount: number;
    unpaidCents: number;
    overdueCount: number;
    overdueCents: number;
    dueWithinDays: number;
    upcomingDueCount: number;
    upcomingDueCents: number;
  };
  period: {
    revenue: RevenueReport;
    expenses: ExpenseReport;
  };
  cashSessions: {
    open: CashSession | null;
    recentlyClosed: CashSession[];
  };
}

function emptyCountRecord<T extends string>(values: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const value of values) {
    record[value] = 0;
  }
  return record;
}

const INVOICE_STATUSES: StudentInvoiceStatus[] = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
];

async function summarizeInvoices(): Promise<AccountantDashboard["invoices"]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + UPCOMING_DUE_DAYS * 24 * 60 * 60 * 1000);

  const [byStatusGrouped, unpaidInvoices] = await Promise.all([
    prisma.studentInvoice.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.studentInvoice.findMany({
      where: { deletedAt: null, status: { in: [...UNPAID_STATUSES] as StudentInvoiceStatus[] } },
      select: { totalCents: true, paidCents: true, dueAt: true },
    }),
  ]);

  const byStatus = emptyCountRecord(INVOICE_STATUSES);
  for (const row of byStatusGrouped) {
    byStatus[row.status] = row._count._all;
  }

  let unpaidCents = 0;
  let overdueCount = 0;
  let overdueCents = 0;
  let upcomingDueCount = 0;
  let upcomingDueCents = 0;

  for (const invoice of unpaidInvoices) {
    const balanceCents = invoice.totalCents - invoice.paidCents;
    unpaidCents += balanceCents;

    if (invoice.dueAt !== null && invoice.dueAt < now) {
      overdueCount += 1;
      overdueCents += balanceCents;
    } else if (invoice.dueAt !== null && invoice.dueAt <= horizon) {
      upcomingDueCount += 1;
      upcomingDueCents += balanceCents;
    }
  }

  return {
    byStatus,
    unpaidCount: unpaidInvoices.length,
    unpaidCents,
    overdueCount,
    overdueCents,
    dueWithinDays: UPCOMING_DUE_DAYS,
    upcomingDueCount,
    upcomingDueCents,
  };
}

async function summarizeCashSessions(): Promise<AccountantDashboard["cashSessions"]> {
  const [open, recentlyClosed] = await Promise.all([
    prisma.cashSession.findFirst({ where: { status: "OPEN" } }),
    prisma.cashSession.findMany({
      where: { status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      take: RECENT_CASH_SESSIONS_LIMIT,
    }),
  ]);
  return { open, recentlyClosed };
}

/**
 * §18 "Comptable" : réutilise financial-report.service.ts (§23 tranche 5) pour les
 * figures "aujourd'hui" et "sur la période" plutôt que de dupliquer l'agrégation
 * recettes/dépenses — seuls factures/impayés/échéances/caisse sont propres à ce
 * tableau de bord.
 */
export async function getAccountantDashboard(query: DashboardWindowQuery): Promise<AccountantDashboard> {
  const windowDays = query.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [todayRevenue, recentPayments, invoices, periodRevenue, periodExpenses, cashSessions] =
    await Promise.all([
      getRevenueReport({ startDate: startOfToday, endDate: now }),
      prisma.studentPayment.findMany({
        where: { paidAt: { gte: startOfToday, lte: now } },
        orderBy: { paidAt: "desc" },
        take: RECENT_PAYMENTS_LIMIT,
      }),
      summarizeInvoices(),
      getRevenueReport({ startDate: since, endDate: now }),
      getExpenseReport({ startDate: since, endDate: now }),
      summarizeCashSessions(),
    ]);

  return {
    windowDays,
    today: { revenue: todayRevenue, recentPayments },
    invoices,
    period: { revenue: periodRevenue, expenses: periodExpenses },
    cashSessions,
  };
}
