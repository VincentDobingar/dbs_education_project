import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { prisma } from "../../lib/prisma.js";
import { getStudent } from "../students/student.service.js";

import { requireReportCard } from "./report-card.service.js";

// Charte partagée avec apps/web/tailwind.config.ts.
const C = {
  night: "#0f172a",
  teal: "#14b8a6",
  gold: "#f59e0b",
  ink: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  wash: "#f8fafc",
};
const fmt = (value: { toString(): string } | number | null | undefined) =>
  value == null ? "-" : Number(value.toString()).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
export async function generateReportCardPdf(reportCardId: string, tenant: TenantLetterhead): Promise<Buffer> {
  return generateReportCardsPdf([reportCardId], tenant);
}

export async function generateClassReportCardsPdf(
  classroomId: string,
  academicPeriodId: string,
  tenant: TenantLetterhead,
): Promise<Buffer> {
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  const period = await prisma.academicPeriod.findUnique({ where: { id: academicPeriodId } });
  if (!classroom || classroom.deletedAt)
    throw new AppError(404, "CLASSROOM_NOT_FOUND", "Classroom not found");
  if (!period || period.academicYearId !== classroom.academicYearId)
    throw new AppError(400, "INVALID_PERIOD", "La période ne correspond pas à l'année de la classe.");
  const enrolled = await prisma.enrollment.findMany({
    where: { classroomId, academicYearId: period.academicYearId, deletedAt: null },
    include: { student: true },
  });
  const cards = await prisma.reportCard.findMany({
    where: {
      academicPeriodId,
      studentId: { in: enrolled.filter((e) => !e.student.deletedAt).map((e) => e.studentId) },
    },
  });
  const names = new Map(enrolled.map((e) => [e.studentId, e.student.lastName + " " + e.student.firstName]));
  cards.sort((a, b) =>
    (names.get(a.studentId) ?? a.studentId).localeCompare(names.get(b.studentId) ?? b.studentId, "fr"),
  );
  if (!cards.length)
    throw new AppError(400, "NO_REPORT_CARDS", "Aucun bulletin généré pour cette classe et cette période.");
  return generateReportCardsPdf(
    cards.map((c) => c.id),
    tenant,
  );
}

async function loadReportCard(reportCardId: string) {
  const card = await requireReportCard(reportCardId);
  const student = await getStudent(card.studentId);
  const academicPeriod = await prisma.academicPeriod.findUnique({
    where: { id: card.academicPeriodId },
    include: { academicYear: true },
  });
  if (!academicPeriod) throw new AppError(404, "ACADEMIC_PERIOD_NOT_FOUND", "Academic period not found");
  const period = academicPeriod;
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId: student.id, academicYearId: period.academicYearId } },
    include: { classroom: true, gradeLevel: true },
  });
  const subjects = await prisma.subject.findMany({
    where: { id: { in: card.items.map((item) => item.subjectId) } },
  });
  const names = new Map(subjects.map((subject) => [subject.id, subject.nameFr]));
  const items = [...card.items].sort((a, b) =>
    (names.get(a.subjectId) ?? "").localeCompare(names.get(b.subjectId) ?? "", "fr"),
  );

  const count = enrollment
    ? await prisma.enrollment.count({
        where: {
          classroomId: enrollment.classroomId,
          academicYearId: period.academicYearId,
          deletedAt: null,
          status: { in: ["ENROLLED", "RE_ENROLLED"] },
        },
      })
    : 0;

  return { card, student, period, enrollment, names, items, count };
}

async function generateReportCardsPdf(ids: string[], tenant: TenantLetterhead): Promise<Buffer> {
  const records = [] as Awaited<ReturnType<typeof loadReportCard>>[];
  for (const id of ids) records.push(await loadReportCard(id));
  const logo = await fetchTenantLogo(tenant.logoUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
      info: {
        Title: "Bulletins scolaires premium",
        Author: tenant.name,
        Creator: "EduManage",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (const [index, { card, student, period, enrollment, names, items, count }] of records.entries()) {
      if (index > 0) doc.addPage();
      const firstPage = doc.bufferedPageRange().count - 1;
      const W = doc.page.width,
        H = doc.page.height,
        left = 40,
        width = W - 80;
      const text = (s: string, x: number, y: number, w: number, size = 9, color = C.ink, bold = false) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(size)
          .fillColor(color)
          .text(s, x, y, { width: w, lineGap: 2 });
      };
      function decoration() {
        doc.save();
        if (logo) {
          try {
            doc.opacity(0.055).image(logo, 140, 250, { fit: [315, 315], align: "center", valign: "center" });
          } catch {
            /* Logo illisible : entête typographique. */
          }
        }
        doc.restore();
        doc.rect(0, 0, W, 8).fill(C.teal);
        doc.rect(W - 95, 0, 95, 8).fill(C.gold);
      }
      function tableHeader(y: number) {
        doc.roundedRect(left, y, width, 28, 5).fill(C.night);
        text("MATIÈRE", 50, y + 9, 219, 8, "#ffffff", true);
        text("MOY. /20", 279, y + 9, 65, 8, "#ffffff", true);
        text("COEF.", 350, y + 9, 47, 8, "#ffffff", true);
        text("APPRÉCIATION", 407, y + 9, 135, 8, "#ffffff", true);
        return y + 28;
      }
      function continuedPage(withTable = true) {
        doc.addPage();
        decoration();
        text(tenant.name, left, 25, width, 14, C.night, true);
        text(
          "Bulletin - " + student.firstName + " " + student.lastName + " | " + period.name,
          left,
          48,
          width,
          9,
          C.muted,
        );
        return withTable ? tableHeader(74) : 75;
      }
      decoration();
      if (logo) {
        try {
          doc.image(logo, 40, 29, { fit: [65, 65], align: "center", valign: "center" });
        } catch {
          /* texte seul */
        }
      } else {
        doc.roundedRect(40, 30, 62, 62, 10).fill(C.night);
        text(tenant.name.slice(0, 2).toUpperCase(), 51, 47, 43, 22, "#ffffff", true);
      }
      text(tenant.name, 122, 29, width - 82, 20, C.night, true);
      text("EDUMANAGE / SUIVI DES APPRENTISSAGES", 122, 60, width - 82, 8, C.muted, true);
      text("BULLETIN SCOLAIRE", left, 112, width, 23, C.night, true);
      text(period.name + "  /  ANNÉE " + period.academicYear.name, left, 144, width, 10, C.muted);
      doc
        .moveTo(left, 169)
        .lineTo(left + width, 169)
        .strokeColor(C.teal)
        .lineWidth(2)
        .stroke();
      doc.roundedRect(left, 185, width, 77, 8).fill(C.wash);
      text("ÉLÈVE", 54, 197, 275, 7, C.muted, true);
      text(student.firstName + " " + student.lastName, 54, 211, 275, 14, C.night, true);
      text("Matricule : " + student.matricule, 54, 236, 275, 8, C.muted);
      text("CLASSE / EFFECTIF", 351, 197, 180, 7, C.muted, true);
      text(
        (enrollment?.classroom.name ?? "-") + " / " + count + " élève(s)",
        351,
        213,
        180,
        11,
        C.night,
        true,
      );
      text(enrollment?.gradeLevel.nameFr ?? "", 351, 237, 180, 8, C.muted);
      let y = tableHeader(283);
      items.forEach((item, index) => {
        const name = names.get(item.subjectId) ?? "Matière";
        const score = item.averageScore === null ? null : Number(item.averageScore.toString());
        const comment =
          item.teacherComment ??
          (score === null
            ? "Non évalué"
            : score >= 16
              ? "Très bon travail"
              : score >= 14
                ? "Bon travail"
                : score >= 12
                  ? "Travail satisfaisant"
                  : score >= 10
                    ? "Poursuivre les efforts"
                    : "Accompagnement conseillé");
        doc.font("Helvetica").fontSize(9);
        const rowHeight = Math.max(
          33,
          doc.heightOfString(name, { width: 219 }) + 16,
          doc.heightOfString(comment, { width: 135 }) + 16,
        );
        if (y + rowHeight > H - 72) y = continuedPage();
        if (index % 2 === 0)
          doc.save().fillOpacity(0.72).rect(left, y, width, rowHeight).fill(C.wash).restore();
        text(name, 50, y + 9, 219, 9, C.ink, true);
        text(fmt(item.averageScore), 279, y + 9, 65, 10, C.night, true);
        text(fmt(item.coefficient), 350, y + 9, 47);
        text(comment, 407, y + 9, 135, 8, C.muted);
        doc
          .moveTo(left, y + rowHeight)
          .lineTo(left + width, y + rowHeight)
          .strokeColor(C.line)
          .lineWidth(0.5)
          .stroke();
        y += rowHeight;
      });
      if (y + 132 > H - 62) y = continuedPage(false);
      y += 19;
      doc.roundedRect(left, y, 175, 71, 8).fill(C.night);
      text("MOYENNE GÉNÉRALE", 54, y + 12, 150, 7, "#cbd5e1", true);
      text(fmt(card.averageScore) + " / 20", 54, y + 31, 150, 23, "#ffffff", true);
      text("RANG", 237, y + 10, 140, 7, C.muted, true);
      text(
        card.classRank ? fmt(card.classRank) + " / " + count : "Non classé",
        237,
        y + 28,
        140,
        14,
        C.night,
        true,
      );
      text("MENTION", 404, y + 10, 140, 7, C.muted, true);
      text(card.mention ?? "-", 404, y + 28, 140, 14, C.night, true);
      doc.rect(237, y + 54, 300, 3).fill(C.gold);
      y += 91;
      text("VISA DU RESPONSABLE LEGAL", left, y, 240, 8, C.muted, true);
      text("VISA DE LA DIRECTION", 330, y, 225, 8, C.muted, true);
      const range = doc.bufferedPageRange();
      for (let page = firstPage; page < range.count; page++) {
        doc.switchToPage(range.start + page);
        doc.page.margins.bottom = 0;
        doc
          .moveTo(left, H - 53)
          .lineTo(W - left, H - 53)
          .strokeColor(C.line)
          .stroke();
        text(
          "EduManage  |  Document scolaire - " + new Date(card.generatedAt).toISOString().slice(0, 10),
          left,
          H - 42,
          410,
          7,
          C.muted,
        );
        text(
          "Page " + (page - firstPage + 1) + " / " + (range.count - firstPage),
          W - 105,
          H - 42,
          65,
          7,
          C.muted,
        );
        doc.page.margins.bottom = 40;
      }
      doc.switchToPage(doc.bufferedPageRange().count - 1);
    }
    doc.end();
  });
}
