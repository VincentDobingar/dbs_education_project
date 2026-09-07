import { buildXlsxBuffer, type XlsxCellValue } from "../../lib/xlsx.js";

import type { ExpenseReport, RevenueReport } from "./financial-report.service.js";

function amountInMainUnit(amountCents: number): number {
  return amountCents / 100;
}

const REPORT_COLUMNS = ["Ligne", "Montant"] as const;

export function revenueReportToXlsx(report: RevenueReport): Promise<Buffer> {
  const rows: XlsxCellValue[][] = [
    ["Total encaissé", amountInMainUnit(report.grossRevenueCents)],
    ["Total remboursé", amountInMainUnit(report.refundedCents)],
    ["Net", amountInMainUnit(report.netRevenueCents)],
    ["Nombre de paiements", report.paymentCount],
    ...report.byMethod.map((entry): XlsxCellValue[] => [
      `Par mode — ${entry.label}`,
      amountInMainUnit(entry.amountCents),
    ]),
    ...report.byDay.map((entry): XlsxCellValue[] => [
      `Par jour — ${entry.label}`,
      amountInMainUnit(entry.amountCents),
    ]),
  ];
  return buildXlsxBuffer("Recettes", REPORT_COLUMNS, rows);
}

export function expenseReportToXlsx(report: ExpenseReport): Promise<Buffer> {
  const rows: XlsxCellValue[][] = [
    ["Total dépensé", amountInMainUnit(report.totalExpensesCents)],
    ["Nombre de dépenses", report.expenseCount],
    ...report.byCategory.map((entry): XlsxCellValue[] => [
      `Par catégorie — ${entry.label}`,
      amountInMainUnit(entry.amountCents),
    ]),
    ...report.byDay.map((entry): XlsxCellValue[] => [
      `Par jour — ${entry.label}`,
      amountInMainUnit(entry.amountCents),
    ]),
  ];
  return buildXlsxBuffer("Dépenses", REPORT_COLUMNS, rows);
}
