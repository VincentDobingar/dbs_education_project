import type {
  Announcement,
  ReportCard,
  Student,
  StudentPayment,
  StudentReceipt,
  TimetableEntry,
} from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { listAnnouncementsForStudent } from "../communication/announcement.service.js";
import { generateReceiptPdf } from "../finance/receipt-pdf.service.js";
import { requireStudentInvoice } from "../finance/student-invoice.service.js";
import { listReceiptsForStudent, requireReceipt } from "../finance/student-payment.service.js";
import { generateReportCardPdf } from "../grading/report-card-pdf.service.js";
import * as reportCardService from "../grading/report-card.service.js";
import type { ReportCardWithItems } from "../grading/report-card.service.js";
import { listTimetableEntries, listTimetables } from "../school-config/timetable.service.js";
import { getStudent, requireCurrentEnrollment } from "../students/student.service.js";
import type { CurrentEnrollment } from "../students/student.service.js";

import type { ListMyReportCardsQuery } from "./student-portal.validation.js";

export interface StudentProfile {
  student: Omit<Student, "medicalNotes">;
  currentEnrollment: CurrentEnrollment | null;
}

/** L'inscription active reste optionnelle ici : un profil doit s'afficher même sans elle. */
export async function getStudentProfile(studentId: string): Promise<StudentProfile> {
  const student = await getStudent(studentId);

  let currentEnrollment: CurrentEnrollment | null = null;
  try {
    currentEnrollment = await requireCurrentEnrollment(studentId);
  } catch (err) {
    if (!(err instanceof AppError && err.code === "STUDENT_NOT_ENROLLED")) {
      throw err;
    }
  }

  return { student, currentEnrollment };
}

export async function getMyTimetable(studentId: string): Promise<TimetableEntry[]> {
  const enrollment = await requireCurrentEnrollment(studentId);
  const timetables = await listTimetables({
    classroomId: enrollment.classroomId,
    academicYearId: enrollment.academicYearId,
  });
  const entriesByTimetable = await Promise.all(
    timetables.map((timetable) => listTimetableEntries(timetable.id)),
  );
  return entriesByTimetable.flat();
}

export async function getMyReportCards(
  studentId: string,
  query: ListMyReportCardsQuery,
): Promise<ReportCard[]> {
  return reportCardService.listReportCards({ studentId, ...query });
}

/** Never confirm the existence of another student's report card (404, not 403). */
export async function getMyReportCard(studentId: string, reportCardId: string): Promise<ReportCardWithItems> {
  const reportCard = await reportCardService.requireReportCard(reportCardId);
  if (reportCard.studentId !== studentId) {
    throw new AppError(404, "REPORT_CARD_NOT_FOUND", `Report card not found: ${reportCardId}`);
  }
  return reportCard;
}

export async function getMyReportCardPdf(
  studentId: string,
  reportCardId: string,
  tenantName: string,
): Promise<Buffer> {
  await getMyReportCard(studentId, reportCardId);
  return generateReportCardPdf(reportCardId, tenantName);
}

export async function getMyAnnouncements(studentId: string): Promise<Announcement[]> {
  return listAnnouncementsForStudent(studentId, "STUDENTS");
}

export async function getMyReceipts(
  studentId: string,
): Promise<(StudentReceipt & { payment: StudentPayment })[]> {
  return listReceiptsForStudent(studentId);
}

/** Never confirm the existence of another student's receipt (404, not 403). */
export async function getMyReceiptPdf(
  studentId: string,
  receiptId: string,
  tenantName: string,
): Promise<Buffer> {
  const receipt = await requireReceipt(receiptId);
  const invoice = await requireStudentInvoice(receipt.payment.studentInvoiceId);
  if (invoice.studentId !== studentId) {
    throw new AppError(404, "RECEIPT_NOT_FOUND", `Receipt not found: ${receiptId}`);
  }
  return generateReceiptPdf(receiptId, tenantName);
}
