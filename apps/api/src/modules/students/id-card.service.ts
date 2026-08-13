import PDFDocument from "pdfkit";

import { getStudent, requireCurrentEnrollment } from "./student.service.js";

// CR80 ID card size (85.6mm x 53.98mm) expressed in PDF points (1mm ≈ 2.83465pt).
const CARD_WIDTH = 242.65;
const CARD_HEIGHT = 153.07;

/**
 * Text-only card: photoUrl is a client-supplied external URL, and fetching it
 * server-side to embed here would be a straightforward SSRF vector (no allowlist,
 * timeout, or size cap exists for that yet) — deliberately deferred, not an
 * oversight.
 */
export async function generateIdCardPdf(studentId: string, tenantName: string): Promise<Buffer> {
  const student = await getStudent(studentId);
  const enrollment = await requireCurrentEnrollment(studentId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [CARD_WIDTH, CARD_HEIGHT], margin: 12 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(9).font("Helvetica-Bold").text(tenantName, { align: "center" });
    doc.moveDown(0.6);

    doc.fontSize(11).text(`${student.firstName} ${student.lastName}`, { align: "center" });
    doc.moveDown(0.4);

    doc.fontSize(8).font("Helvetica");
    doc.text(`Matricule : ${student.matricule}`);
    if (student.dateOfBirth) {
      doc.text(`Né(e) le : ${student.dateOfBirth.toISOString().slice(0, 10)}`);
    }
    doc.text(`Classe : ${enrollment.classroomName}`);
    doc.text(`Année scolaire : ${enrollment.academicYearName}`);
    doc.moveDown(0.4);
    doc
      .fontSize(6)
      .fillColor("#666666")
      .text(`Émise le ${new Date().toISOString().slice(0, 10)}`);

    doc.end();
  });
}
