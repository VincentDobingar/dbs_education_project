import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { requireReceipt } from "./student-payment.service.js";

// Palette EduManage, identique au bulletin et aux couleurs brand du frontend.
const C = {
  night: "#0f172a",
  teal: "#14b8a6",
  gold: "#f59e0b",
  ink: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  wash: "#f8fafc",
  red: "#b91c1c",
};
const METHODS: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement bancaire",
  CARD: "Carte bancaire",
  MOBILE_MONEY: "Mobile Money",
  WALLET: "Portefeuille",
  PREPAID_CODE: "Code prépayé",
  SPONSOR: "Prise en charge",
  CREDIT: "Avoir",
};
const amount = (cents: number) =>
  (cents / 100)
    .toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/[\u00a0\u202f]/g, " ");
const date = (value: Date) => value.toLocaleDateString("fr-FR", { timeZone: "UTC" });
export async function generateReceiptPdf(receiptId: string, tenant: TenantLetterhead): Promise<Buffer> {
  const receipt = await requireReceipt(receiptId);
  const invoice = await prisma.studentInvoice.findUnique({ where: { id: receipt.payment.studentInvoiceId } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Student invoice not found");
  const student = await getStudent(invoice.studentId);
  const school = await prisma.tenant.findUnique({
    where: { id: student.tenantId },
    select: { currency: { select: { isoCode: true } } },
  });
  const employee = receipt.payment.recordedByEmployeeId
    ? await prisma.employee.findUnique({
        where: { id: receipt.payment.recordedByEmployeeId },
        select: { tenantId: true, firstName: true, lastName: true },
      })
    : null;
  const currency = school?.currency.isoCode ?? "";
  const logo = await fetchTenantLogo(tenant.logoUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A5",
      margin: 28,
      info: { Title: "Reçu de paiement - " + receipt.number, Author: tenant.name, Creator: "EduManage" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width,
      H = doc.page.height,
      left = 28,
      width = W - 56;
    const text = (s: string, x: number, y: number, w: number, size = 9, color = C.ink, bold = false) => {
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(s, x, y, { width: w, lineGap: 2 });
    };
    const field = (label: string, value: string, y: number) => {
      text(label, left, y, 105, 8, C.muted);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(C.ink)
        .text(value, left + 112, y, { width: width - 112, height: 19, ellipsis: true, lineGap: 1 });
    };
    doc.save();
    if (logo) {
      try {
        doc.opacity(0.055).image(logo, 80, 220, { fit: [260, 260], align: "center", valign: "center" });
      } catch {
        /* En-tête typographique si image illisible. */
      }
    }
    doc.restore();
    doc.rect(0, 0, W, 7).fill(C.teal);
    doc.rect(W - 72, 0, 72, 7).fill(C.gold);
    if (logo) {
      try {
        doc.image(logo, left, 26, { fit: [52, 52], align: "center", valign: "center" });
      } catch {
        /* Aucun échec de reçu pour un logo. */
      }
    } else {
      doc.roundedRect(left, 26, 52, 52, 8).fill(C.night);
      text(tenant.name.slice(0, 2).toUpperCase(), left + 8, 40, 40, 20, "#ffffff", true);
    }
    let nameSize = 17;
    while (nameSize > 10) {
      doc.font("Helvetica-Bold").fontSize(nameSize);
      if (doc.heightOfString(tenant.name, { width: W - 124 }) <= 37) break;
      nameSize--;
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(nameSize)
      .fillColor(C.night)
      .text(tenant.name, 96, 26, { width: W - 124, height: 38, ellipsis: true });
    text("EDUMANAGE / FINANCES SCOLAIRES", 96, 70, W - 124, 6.5, C.muted, true);
    text("REÇU DE PAIEMENT", left, 105, width, 23, C.night, true);
    text("Justificatif d'encaissement", left, 136, width, 9, C.muted);
    doc.roundedRect(left, 158, width, 85, 8).fill(C.wash);
    text("NUMÉRO DU REÇU", left + 13, 169, width - 26, 6.5, C.muted, true);
    text(receipt.number, left + 13, 182, width - 26, 8, C.night, true);
    text("FACTURE ASSOCIÉE", left + 13, 207, width - 26, 6.5, C.muted, true);
    text(invoice.number, left + 13, 220, width - 26, 8, C.ink);
    text("ÉLÈVE", left, 260, width, 7, C.muted, true);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(C.night)
      .text(student.firstName + " " + student.lastName, left, 274, { width, height: 33, ellipsis: true });
    text("Matricule : " + student.matricule, left, 308, width, 8, C.muted);
    doc.roundedRect(left, 332, width, 67, 8).fill(C.night);
    text("MONTANT ENCAISSÉ", left + 14, 344, width - 28, 7, "#cbd5e1", true);
    text(
      amount(receipt.payment.amountCents) + " " + currency,
      left + 14,
      363,
      width - 28,
      25,
      "#ffffff",
      true,
    );
    field("Mode de règlement", METHODS[receipt.payment.method] ?? receipt.payment.method, 418);
    field("Date du paiement", date(receipt.payment.paidAt), 436);
    field("Enregistré par", employee ? employee.firstName + " " + employee.lastName : "-", 454);
    if (receipt.refundedCents > 0) {
      const net = receipt.payment.amountCents - receipt.refundedCents;
      doc.roundedRect(left, 480, width, 62, 7).fill("#fef2f2");
      text(
        net <= 0 ? "REÇU ANNULÉ - PAIEMENT INTÉGRALEMENT REMBOURSÉ" : "PAIEMENT PARTIELLEMENT REMBOURSÉ",
        left + 10,
        489,
        width - 20,
        7,
        C.red,
        true,
      );
      text(
        "Montant remboursé : " + amount(receipt.refundedCents) + " " + currency,
        left + 10,
        507,
        width - 20,
        8,
        C.red,
      );
      text(
        "Montant net après remboursement : " + amount(net) + " " + currency,
        left + 10,
        523,
        width - 20,
        8,
        C.red,
        true,
      );
    } else {
      doc
        .moveTo(left, 485)
        .lineTo(W - left, 485)
        .strokeColor(C.gold)
        .lineWidth(2)
        .stroke();
      text("VISA DU RESPONSABLE", left, 503, width / 2, 7, C.muted, true);
      text("CACHET DE L'ÉTABLISSEMENT", left + width / 2, 503, width / 2, 7, C.muted, true);
    }
    doc
      .moveTo(left, H - 37)
      .lineTo(W - left, H - 37)
      .strokeColor(C.line)
      .lineWidth(0.5)
      .stroke();
    doc.page.margins.bottom = 0;
    text("EduManage | Émis le " + date(receipt.issuedAt), left, H - 26, width - 45, 6, C.muted);
    text("Page 1/1", W - 68, H - 26, 40, 6, C.muted);
    doc.end();
  });
}
