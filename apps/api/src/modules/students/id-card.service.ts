import PDFDocument from "pdfkit";

import { AppError } from "../../lib/errors.js";
import { fetchTenantLogo, type TenantLetterhead } from "../../lib/pdf-letterhead.js";
import { fetchImageSafely } from "../../lib/safe-image-fetch.js";
import { isStudentUnavailable } from "../../lib/student-status.js";

import { getStudent, requireCurrentEnrollment } from "./student.service.js";

// CR80 ID card size (85.6mm x 53.98mm) expressed in PDF points (1mm ≈ 2.83465pt).
const CARD_WIDTH = 242.65;
const CARD_HEIGHT = 153.07;
const PHOTO_SIZE = 56;
const LOGO_SIZE = 16; // carte trop petite pour le même logo 40pt que les autres documents.

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
  const student = await getStudent(studentId);
  // completeTransfer()/withdrawStudent() (transfer.service.ts) posent
  // Student.status sans jamais toucher l'Enrollment courant -- requireCurrentEnrollment
  // seul continuait donc de valider un eleve transfere/retire/diplome, permettant de
  // regenerer une carte d'eleve pour quelqu'un qui n'appartient plus a cet
  // etablissement (meme signal que requireLinkedStudent, lib/student-status.ts).
  if (isStudentUnavailable(student)) {
    throw new AppError(403, "STUDENT_UNAVAILABLE", "This student is no longer active");
  }
  const enrollment = await requireCurrentEnrollment(studentId);
  const photo = student.photoUrl ? await fetchImageSafely(student.photoUrl) : null;
  const logo = await fetchTenantLogo(tenant.logoUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [CARD_WIDTH, CARD_HEIGHT], margin: 12 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Logo centré au-dessus du nom, en miniature (la carte CR80 n'a pas la largeur
    // du texte étiré pour l'accueillir en coin sans risquer un chevauchement).
    if (logo !== null) {
      try {
        const logoX = (CARD_WIDTH - LOGO_SIZE) / 2;
        doc.image(logo, logoX, doc.y, { width: LOGO_SIZE, height: LOGO_SIZE, fit: [LOGO_SIZE, LOGO_SIZE] });
        doc.y += LOGO_SIZE + 3;
      } catch {
        // Octets récupérés mais non décodables par pdfkit -- carte sans logo.
      }
    }
    doc.fontSize(9).font("Helvetica-Bold").text(tenant.name, { align: "center" });
    doc.moveDown(0.6);

    // Deux colonnes quand une photo a pu être récupérée (texte réduit à la largeur
    // restante) ; sinon le texte occupe toute la largeur, comportement inchangé.
    const textWidth = photo !== null ? CARD_WIDTH - 24 - PHOTO_SIZE - 8 : CARD_WIDTH - 24;
    if (photo !== null) {
      const photoX = doc.x + textWidth + 8;
      const photoY = doc.y;
      try {
        doc.image(photo, photoX, photoY, {
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
          fit: [PHOTO_SIZE, PHOTO_SIZE],
        });
      } catch {
        // Bytes récupérés mais pas un JPEG/PNG valide que pdfkit sait décoder —
        // même repli que toute autre défaillance : carte sans photo, pas d'échec.
      }
    }

    doc.fontSize(11).text(`${student.firstName} ${student.lastName}`, {
      width: textWidth,
      align: photo !== null ? "left" : "center",
    });
    doc.moveDown(0.4);

    doc.fontSize(8).font("Helvetica");
    doc.text(`Matricule : ${student.matricule}`, { width: textWidth });
    if (student.dateOfBirth) {
      doc.text(`Né(e) le : ${student.dateOfBirth.toISOString().slice(0, 10)}`, { width: textWidth });
    }
    doc.text(`Classe : ${enrollment.classroomName}`, { width: textWidth });
    doc.text(`Année scolaire : ${enrollment.academicYearName}`, { width: textWidth });
    doc.moveDown(0.4);
    doc
      .fontSize(6)
      .fillColor("#666666")
      .text(`Émise le ${new Date().toISOString().slice(0, 10)}`, { width: textWidth });

    doc.end();
  });
}
