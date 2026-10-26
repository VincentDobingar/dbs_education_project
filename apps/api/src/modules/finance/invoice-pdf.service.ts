import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { requireStudentInvoice } from "./student-invoice.service.js";

const money = (v: number) =>
  (v / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
const date = (v: Date | null) => (v ? v.toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "-");
const statuses: Record<string, string> = {
  ISSUED: "Émise",
  PARTIALLY_PAID: "Partiellement réglée",
  PAID: "Réglée",
  CANCELLED: "Annulée",
};

export async function generateInvoicePdf(invoiceId: string, tenant: TenantLetterhead): Promise<Buffer> {
  const invoice = await requireStudentInvoice(invoiceId);
  if (invoice.status === "DRAFT") throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  const student = await getStudent(invoice.studentId);
  const school = await prisma.tenant.findUnique({
    where: { id: student.tenantId },
    select: { currency: { select: { isoCode: true } } },
  });
  const year = await prisma.academicYear.findUnique({ where: { id: invoice.academicYearId } });
  const logo = await fetchTenantLogo(tenant.logoUrl);
  const currency = school?.currency.isoCode ?? "";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
      info: { Title: "Facture - " + invoice.number, Author: tenant.name, Creator: "EduManage" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width,
      width = W - 80;
    const text = (
      s: string,
      x: number,
      y: number,
      w = width,
      size = 10,
      color = "#334155",
      bold = false,
      height = 30,
    ) =>
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(s, x, y, { width: w, height, ellipsis: true });
    function page() {
      doc.save();
      if (logo) {
        try {
          doc.opacity(0.055).image(logo, 140, 290, { fit: [315, 315], align: "center", valign: "center" });
        } catch {
          /* Logo facultatif. */
        }
      }
      doc.restore();
      doc.rect(0, 0, W, 7).fill("#14b8a6");
      doc.rect(W - 100, 0, 100, 7).fill("#f59e0b");
      if (logo) {
        try {
          doc.image(logo, 40, 28, { fit: [62, 62] });
        } catch {
          /* Logo facultatif. */
        }
      }
      text(tenant.name, 120, 30, width - 80, 20, "#0f172a", true, 48);
      text("EDUMANAGE / FINANCES SCOLAIRES", 120, 84, width - 80, 8, "#64748b");
      text("FACTURE", 40, 120, width, 28, "#0f172a", true, 36);
      text(invoice.number, 40, 160, width, 11, "#334155", true);
      doc.roundedRect(40, 190, width, 112, 8).fill("#f8fafc");
      text(student.firstName + " " + student.lastName, 54, 203, width - 28, 14, "#0f172a", true);
      text("Matricule : " + student.matricule, 54, 235, width - 28, 9);
      text("Année : " + (year?.name ?? "-"), 54, 260, 240, 9);
      text("Statut : " + (statuses[invoice.status] ?? invoice.status), 310, 260, 225, 9);
      text("Émission : " + date(invoice.issuedAt), 40, 317, 240, 9);
      text("Échéance : " + date(invoice.dueAt), 310, 317, 245, 9);
      doc.rect(40, 350, width, 28).fill("#0f172a");
      text("DÉSIGNATION", 50, 359, 265, 8, "#ffffff", true);
      text("BRUT", 324, 359, 72, 8, "#ffffff", true);
      text("REMISE", 400, 359, 70, 8, "#ffffff", true);
      text("NET", 478, 359, 70, 8, "#ffffff", true);
    }
    page();
    let y = 378;
    for (const [i, item] of invoice.items.entries()) {
      doc.font("Helvetica").fontSize(9);
      const h = Math.max(38, doc.heightOfString(item.description, { width: 260 }) + 18);
      if (y + Math.min(h, 340) > 730) {
        doc.addPage();
        page();
        y = 378;
      }
      const rowH = Math.min(h, 340);
      if (i % 2 === 0) doc.rect(40, y, width, rowH).fill("#f8fafc");
      text(item.description, 50, y + 10, 260, 9, "#334155", false, rowH - 16);
      text(money(item.amountCents), 324, y + 10, 72, 9);
      text(money(item.discountCents), 400, y + 10, 70, 9);
      text(money(item.amountCents - item.discountCents), 478, y + 10, 70, 9);
      y += rowH;
    }
    if (y + 170 > 750) {
      doc.addPage();
      page();
      y = 390;
    }
    y += 20;
    doc.roundedRect(40, y, width, 100, 8).fill("#0f172a");
    text("TOTAL FACTURÉ", 55, y + 12, 220, 9, "#cbd5e1", true);
    text(money(invoice.totalCents) + " " + currency, 300, y + 10, 240, 19, "#ffffff", true);
    text(
      "Montant réglé : " + money(invoice.paidCents) + " " + currency,
      55,
      y + 46,
      width - 30,
      10,
      "#ffffff",
    );
    text(
      "Reste à payer : " + money(Math.max(0, invoice.totalCents - invoice.paidCents)) + " " + currency,
      55,
      y + 70,
      width - 30,
      11,
      "#ffffff",
      true,
    );
    text(
      invoice.status === "CANCELLED"
        ? "FACTURE ANNULÉE"
        : "Les paiements sont justifiés par leurs reçus distincts.",
      40,
      y + 117,
      width,
      9,
      "#64748b",
    );
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .moveTo(40, 790)
        .lineTo(W - 40, 790)
        .strokeColor("#e2e8f0")
        .stroke();
      text("EduManage | Facturation scolaire", 40, 804, 360, 8, "#64748b");
      text(`Page ${i + 1}/${range.count}`, W - 105, 804, 65, 8, "#64748b");
    }
    doc.end();
  });
}
