import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { requireReceipt } from "./student-payment.service.js";

export async function generateReceiptPdf(receiptId: string, tenantName: string): Promise<Buffer> {
  const receipt = await requireReceipt(receiptId);
  const invoice = await prisma.studentInvoice.findUnique({ where: { id: receipt.payment.studentInvoiceId } });
  if (!invoice) {
    throw new AppError(
      404,
      "INVOICE_NOT_FOUND",
      `Student invoice not found: ${receipt.payment.studentInvoiceId}`,
    );
  }
  const student = await getStudent(invoice.studentId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).font("Helvetica-Bold").text(tenantName, { align: "center" });
    doc.fontSize(11).font("Helvetica").text("Reçu de paiement", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(9);
    doc.text(`Reçu n° : ${receipt.number}`);
    doc.text(`Facture n° : ${invoice.number}`);
    doc.text(`Élève : ${student.firstName} ${student.lastName} (${student.matricule})`);
    doc.text(`Montant encaissé : ${(receipt.payment.amountCents / 100).toFixed(2)}`);
    doc.text(`Mode de paiement : ${receipt.payment.method}`);
    doc.text(`Date : ${receipt.payment.paidAt.toISOString().slice(0, 10)}`);

    // refundStudentPayment (student-payment.service.ts) ne touche jamais ce
    // StudentReceipt figé -- sans cette mention, un paiement remboursé produisait
    // toujours un reçu visuellement identique à un paiement valide.
    if (receipt.refundedCents > 0) {
      const netCents = receipt.payment.amountCents - receipt.refundedCents;
      doc.fillColor("#b00020");
      doc.text(`Montant remboursé : ${(receipt.refundedCents / 100).toFixed(2)}`);
      doc.text(`Montant net après remboursement : ${(netCents / 100).toFixed(2)}`);
      if (netCents <= 0) {
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text("REÇU ANNULÉ — PAIEMENT INTÉGRALEMENT REMBOURSÉ", { align: "center" });
        doc.font("Helvetica").fontSize(9);
      }
      doc.fillColor("#000000");
    }
    doc.moveDown(1);

    doc
      .fontSize(6)
      .fillColor("#666666")
      .text(`Émis le ${new Date().toISOString().slice(0, 10)}`);

    doc.end();
  });
}
