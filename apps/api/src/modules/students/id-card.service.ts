import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { fetchStudentPhoto, fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { prisma } from "../../lib/prisma.js";
import { isStudentUnavailable } from "../../lib/student-status.js";

import { getStudent, requireCurrentEnrollment } from "./student.service.js";

// CR80 ID card size (85.6mm x 53.98mm) expressed in PDF points (1mm ≈ 2.83465pt).
const CARD_WIDTH = 242.65;
const CARD_HEIGHT = 153.07;

/**
 * `photoUrl` is a client-supplied external URL — embedding it means fetching it
 * server-side, a straightforward SSRF vector without care (see
 * lib/safe-image-fetch.ts for the mitigations: HTTPS only, private/reserved IPs
 * refused, no redirects followed, timeout, size cap, content-type allowlist).
 * Any failure there (missing photo, blocked host, wrong content type...) degrades
 * to the original text-only card rather than failing the whole PDF — a bad or
 * unreachable photo must never block issuing an ID card.
 */
export async function generateIdCardPdf(studentId: string, tenant: TenantLetterhead): Promise<Buffer> {
  return generateCardsPdf([studentId], tenant);
}

export async function generateClassIdCardsPdf(
  classroomId: string,
  tenant: TenantLetterhead,
): Promise<Buffer> {
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom || classroom.deletedAt)
    throw new AppError(404, "CLASSROOM_NOT_FOUND", "Classroom not found");
  const currentYear = await prisma.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!currentYear || classroom.academicYearId !== currentYear.id)
    throw new AppError(400, "CLASSROOM_NOT_CURRENT", "Choisissez une classe de l'année en cours.");
  const enrollments = await prisma.enrollment.findMany({
    where: {
      classroomId,
      academicYearId: currentYear.id,
      deletedAt: null,
      status: { in: ["ENROLLED", "RE_ENROLLED"] },
    },
    include: { student: true },
  });
  const ids = [
    ...new Set(
      enrollments
        .filter((e) => !isStudentUnavailable(e.student))
        .sort(
          (a, b) =>
            a.student.lastName.localeCompare(b.student.lastName, "fr") ||
            a.student.firstName.localeCompare(b.student.firstName, "fr") ||
            a.student.matricule.localeCompare(b.student.matricule),
        )
        .map((e) => e.studentId),
    ),
  ];
  if (!ids.length)
    throw new AppError(400, "CLASSROOM_EMPTY", "Cette classe ne contient aucun élève inscrit actif.");
  return generateCardsPdf(ids, tenant, classroomId);
}

async function generateCardsPdf(
  studentIds: string[],
  tenant: TenantLetterhead,
  classroomId?: string,
): Promise<Buffer> {
  const cards: {
    student: Awaited<ReturnType<typeof getStudent>>;
    enrollment: Awaited<ReturnType<typeof requireCurrentEnrollment>>;
    photo: Buffer | null;
  }[] = [];
  for (const studentId of studentIds) {
    const student = await getStudent(studentId);
    if (isStudentUnavailable(student))
      throw new AppError(403, "STUDENT_UNAVAILABLE", "This student is no longer active");
    const enrollment = await requireCurrentEnrollment(studentId);
    if (classroomId && enrollment.classroomId !== classroomId)
      throw new AppError(409, "ENROLLMENT_CHANGED", "Une inscription a changé. Relancez le téléchargement.");
    const photo = student.photoUrl ? await fetchStudentPhoto(student.photoUrl) : null;
    cards.push({ student, enrollment, photo });
  }
  const logo = await fetchTenantLogo(tenant.logoUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [CARD_WIDTH, CARD_HEIGHT],
      margin: 0,
      info: { Title: "Cartes scolaires premium", Author: tenant.name, Creator: "EduManage" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const text = (
      value: string,
      x: number,
      y: number,
      width: number,
      size: number,
      color = "#334155",
      bold = false,
      height = 14,
    ) => {
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(value, x, y, { width, height, ellipsis: true, lineGap: 1 });
    };
    for (const [index, { student, enrollment, photo }] of cards.entries()) {
      if (index > 0) doc.addPage();
      doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT).fill("#f8fafc");
      doc.save();
      if (logo) {
        try {
          doc.opacity(0.045).image(logo, 115, 52, { fit: [112, 95], align: "center", valign: "center" });
        } catch {
          /* Logo facultatif. */
        }
      }
      doc.restore();
      doc.rect(0, 0, CARD_WIDTH, 43).fill("#0f172a");
      doc.rect(0, 43, CARD_WIDTH, 3).fill("#14b8a6");
      doc.rect(CARD_WIDTH - 40, 43, 40, 3).fill("#f59e0b");
      doc.roundedRect(9, 7, 29, 29, 5).fill("#ffffff");
      let logoDrawn = false;
      if (logo) {
        try {
          doc.image(logo, 11, 9, { fit: [25, 25], align: "center", valign: "center" });
          logoDrawn = true;
        } catch {
          /* En-tête typographique de repli. */
        }
      }
      if (!logoDrawn) text(tenant.name.slice(0, 2).toUpperCase(), 13, 17, 24, 10, "#0f172a", true);
      text(tenant.name, 46, 8, 186, 10, "#ffffff", true, 23);
      text("CARTE SCOLAIRE  /  EDUMANAGE", 46, 32, 186, 5, "#cbd5e1", true, 8);
      doc.roundedRect(10, 56, 51, 63, 5).fill("#e2e8f0");
      let photoDrawn = false;
      if (photo) {
        try {
          doc.image(photo, 12, 58, { fit: [47, 59], align: "center", valign: "center" });
          photoDrawn = true;
        } catch {
          /* Photo illisible : initiales. */
        }
      }
      if (!photoDrawn) {
        text(
          (student.firstName.slice(0, 1) + student.lastName.slice(0, 1)).toUpperCase(),
          21,
          73,
          34,
          20,
          "#64748b",
          true,
          24,
        );
        text("PHOTO", 24, 105, 32, 5, "#64748b");
      }
      text(student.firstName + " " + student.lastName, 71, 55, 161, 11, "#0f172a", true, 28);
      text("MATRICULE", 71, 87, 161, 5, "#64748b", true, 8);
      text(student.matricule, 71, 96, 161, 8, "#0f172a", true, 12);
      text("Classe : " + enrollment.classroomName, 71, 112, 161, 7, "#334155", false, 10);
      if (student.dateOfBirth)
        text(
          "Né(e) le : " + student.dateOfBirth.toLocaleDateString("fr-FR", { timeZone: "UTC" }),
          10,
          123,
          150,
          6,
          "#64748b",
          false,
          9,
        );
      if (student.gender) text("Sexe : " + student.gender, 166, 123, 68, 6, "#64748b", false, 9);
      doc.rect(0, 136, CARD_WIDTH, CARD_HEIGHT - 136).fill("#0f172a");
      text("ANNÉE " + enrollment.academicYearName, 10, 141, 132, 6, "#ffffff", true, 10);
      text(
        "Émise le " + new Date().toLocaleDateString("fr-FR", { timeZone: "UTC" }),
        151,
        141,
        84,
        5,
        "#cbd5e1",
        false,
        10,
      );
      doc.addPage();
      doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT).fill("#f8fafc");
      doc.rect(0, 0, CARD_WIDTH, 28).fill("#0f172a");
      text("COORDONNÉES DE L'ÉLÈVE", 10, 10, 222, 8, "#ffffff", true, 12);
      doc.rect(0, 28, CARD_WIDTH, 3).fill("#14b8a6");
      text(student.firstName + " " + student.lastName, 10, 39, 222, 9, "#0f172a", true, 20);
      text("Téléphone : " + (student.phone ?? "Non renseigné"), 10, 63, 222, 7, "#334155", false, 12);
      text("Adresse : " + (student.address ?? "Non renseignée"), 10, 79, 222, 7, "#334155", false, 24);
      text("Naissance : " + (student.birthPlace ?? "-"), 10, 106, 112, 6, "#64748b", false, 10);
      text("Nationalité : " + (student.nationality ?? "-"), 126, 106, 108, 6, "#64748b", false, 10);
      text(
        "Contact : " + (student.emergencyContactName ?? "Non renseigné"),
        10,
        121,
        222,
        6,
        "#64748b",
        false,
        10,
      );
      doc.rect(0, 136, CARD_WIDTH, CARD_HEIGHT - 136).fill("#0f172a");
      text(
        "Urgence : " + (student.emergencyContactPhone ?? "Non renseigné"),
        10,
        142,
        222,
        6,
        "#ffffff",
        true,
        10,
      );
    }
    doc.end();
  });
}
