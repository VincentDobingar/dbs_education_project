import { buildCsv } from "../../lib/csv.js";

import type { ExpenseReport, RevenueReport } from "./financial-report.service.js";

function formatAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

export function revenueReportToCsv(report: RevenueReport): string {
  const rows = [
    ["Total encaissé", formatAmount(report.grossRevenueCents)],
    ["Total remboursé", formatAmount(report.refundedCents)],
    ["Net", formatAmount(report.netRevenueCents)],
    ["Nombre de paiements", String(report.paymentCount)],
    ...report.byMethod.map((entry) => [`Par mode — ${entry.label}`, formatAmount(entry.amountCents)]),
    ...report.byDay.map((entry) => [`Par jour — ${entry.label}`, formatAmount(entry.amountCents)]),
  ];
  return buildCsv(["Ligne", "Montant"], rows);
}

export function expenseReportToCsv(report: ExpenseReport): string {
  const rows = [
    ["Total dépensé", formatAmount(report.totalExpensesCents)],
    ["Nombre de dépenses", String(report.expenseCount)],
    ...report.byCategory.map((entry) => [`Par catégorie — ${entry.label}`, formatAmount(entry.amountCents)]),
    ...report.byDay.map((entry) => [`Par jour — ${entry.label}`, formatAmount(entry.amountCents)]),
  ];
  return buildCsv(["Ligne", "Montant"], rows);
}
