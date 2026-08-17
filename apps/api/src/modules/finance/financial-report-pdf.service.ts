import PDFDocument from "pdfkit";

import type { ExpenseReport, FinancialReportBreakdown, RevenueReport } from "./financial-report.service.js";

function formatAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function renderBreakdown(doc: PDFKit.PDFDocument, title: string, entries: FinancialReportBreakdown[]): void {
  doc.moveDown(0.5).fontSize(10).font("Helvetica-Bold").text(title);
  doc.font("Helvetica").fontSize(9);
  if (entries.length === 0) {
    doc.text("—");
    return;
  }
  for (const entry of entries) {
    doc.text(`${entry.label} : ${formatAmount(entry.amountCents)}`);
  }
}

function buildPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    build(doc);

    doc.end();
  });
}

export function generateRevenueReportPdf(report: RevenueReport, tenantName: string): Promise<Buffer> {
  return buildPdf((doc) => {
    doc.fontSize(14).font("Helvetica-Bold").text(tenantName, { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Rapport de recettes", { align: "center" });
    doc
      .fontSize(9)
      .text(`Période : ${formatDate(report.startDate)} → ${formatDate(report.endDate)}`, { align: "center" });
    doc.moveDown(1);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(`Total encaissé : ${formatAmount(report.grossRevenueCents)}`);
    doc.text(`Total remboursé : ${formatAmount(report.refundedCents)}`);
    doc.text(`Net : ${formatAmount(report.netRevenueCents)}`);
    doc.font("Helvetica").fontSize(9).text(`Nombre de paiements : ${report.paymentCount}`);

    renderBreakdown(doc, "Par mode de paiement", report.byMethod);
    renderBreakdown(doc, "Par jour", report.byDay);

    doc
      .moveDown(1)
      .fontSize(6)
      .fillColor("#666666")
      .text(`Émis le ${formatDate(new Date())}`);
  });
}

export function generateExpenseReportPdf(report: ExpenseReport, tenantName: string): Promise<Buffer> {
  return buildPdf((doc) => {
    doc.fontSize(14).font("Helvetica-Bold").text(tenantName, { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Rapport de dépenses", { align: "center" });
    doc
      .fontSize(9)
      .text(`Période : ${formatDate(report.startDate)} → ${formatDate(report.endDate)}`, { align: "center" });
    doc.moveDown(1);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(`Total dépensé : ${formatAmount(report.totalExpensesCents)}`);
    doc.font("Helvetica").fontSize(9).text(`Nombre de dépenses : ${report.expenseCount}`);

    renderBreakdown(doc, "Par catégorie", report.byCategory);
    renderBreakdown(doc, "Par jour", report.byDay);

    doc
      .moveDown(1)
      .fontSize(6)
      .fillColor("#666666")
      .text(`Émis le ${formatDate(new Date())}`);
  });
}
