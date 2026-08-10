import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { requireReportCard } from "./report-card.service.js";

export async function generateReportCardPdf(reportCardId: string, tenantName: string): Promise<Buffer> {
  const reportCard = await requireReportCard(reportCardId);
  const student = await getStudent(reportCard.studentId);
  const academicPeriod = await prisma.academicPeriod.findUnique({
    where: { id: reportCard.academicPeriodId },
    include: { academicYear: true },
  });
  if (!academicPeriod) {
    throw new AppError(
      404,
      "ACADEMIC_PERIOD_NOT_FOUND",
      `Academic period not found: ${reportCard.academicPeriodId}`,
    );
  }

  const subjects = await prisma.subject.findMany({
    where: { id: { in: reportCard.items.map((item) => item.subjectId) } },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.nameFr]));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).font("Helvetica-Bold").text(tenantName, { align: "center" });
    doc.fontSize(12).font("Helvetica").text("Bulletin scolaire", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Élève : ${student.firstName} ${student.lastName} (${student.matricule})`);
    doc.text(`Période : ${academicPeriod.name} — Année scolaire ${academicPeriod.academicYear.name}`);
    doc.moveDown(0.8);

    const columns = { subject: 40, average: 300, coefficient: 380, comment: 450 };
    doc.font("Helvetica-Bold");
    doc.text("Matière", columns.subject, doc.y, { continued: false });
    doc.text("Moyenne /20", columns.average, doc.y - doc.currentLineHeight());
    doc.text("Coef.", columns.coefficient, doc.y - doc.currentLineHeight());
    doc.text("Appréciation", columns.comment, doc.y - doc.currentLineHeight());
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    doc.font("Helvetica");
    for (const item of reportCard.items) {
      const y = doc.y;
      doc.text(subjectNameById.get(item.subjectId) ?? item.subjectId, columns.subject, y, { width: 250 });
      doc.text(item.averageScore !== null ? item.averageScore.toString() : "—", columns.average, y);
      doc.text(item.coefficient !== null ? item.coefficient.toString() : "—", columns.coefficient, y);
      doc.text(item.teacherComment ?? "", columns.comment, y, { width: 105 });
      doc.moveDown(0.6);
    }

    doc.moveDown(0.6);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(
      `Moyenne générale : ${reportCard.averageScore !== null ? reportCard.averageScore.toString() : "—"} / 20`,
    );
    doc.text(`Rang : ${reportCard.classRank ?? "—"}`);
    doc.text(`Mention : ${reportCard.mention ?? "—"}`);

    doc.moveDown(1);
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#666666")
      .text(`Généré le ${new Date().toISOString().slice(0, 10)}`);

    doc.end();
  });
}
