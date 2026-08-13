import type { Announcement, Attendance, ReportCard, TimetableEntry } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import * as attendanceService from "../attendance/attendance.service.js";
import { listAnnouncementsForStudent } from "../communication/announcement.service.js";
import {
  getStudentFinancialSituation,
  type StudentFinancialSituation,
} from "../finance/financial-situation.service.js";
import { generateReceiptPdf } from "../finance/receipt-pdf.service.js";
import { requireStudentInvoice } from "../finance/student-invoice.service.js";
import { requireReceipt } from "../finance/student-payment.service.js";
import { generateReportCardPdf } from "../grading/report-card-pdf.service.js";
import * as reportCardService from "../grading/report-card.service.js";
import type { ReportCardWithItems } from "../grading/report-card.service.js";
import { listTimetableEntries, listTimetables } from "../school-config/timetable.service.js";
import { requireCurrentEnrollment } from "../students/student.service.js";

import type { ListChildAttendanceQuery, ListChildReportCardsQuery } from "./parent-portal.validation.js";

export async function getChildAttendance(
  studentId: string,
  query: ListChildAttendanceQuery,
): Promise<Attendance[]> {
  return attendanceService.listAttendance({ studentId, ...query });
}

export async function getChildReportCards(
  studentId: string,
  query: ListChildReportCardsQuery,
): Promise<ReportCard[]> {
  return reportCardService.listReportCards({ studentId, ...query });
}

/** Never confirm the existence of another student's report card (404, not 403). */
export async function getChildReportCard(
  studentId: string,
  reportCardId: string,
): Promise<ReportCardWithItems> {
  const reportCard = await reportCardService.requireReportCard(reportCardId);
  if (reportCard.studentId !== studentId) {
    throw new AppError(404, "REPORT_CARD_NOT_FOUND", `Report card not found: ${reportCardId}`);
  }
  return reportCard;
}

export async function getChildReportCardPdf(
  studentId: string,
  reportCardId: string,
  tenantName: string,
): Promise<Buffer> {
  await getChildReportCard(studentId, reportCardId);
  return generateReportCardPdf(reportCardId, tenantName);
}

export async function getChildTimetable(studentId: string): Promise<TimetableEntry[]> {
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

export async function getChildAnnouncements(studentId: string): Promise<Announcement[]> {
  return listAnnouncementsForStudent(studentId);
}

export async function getChildFinancialSituation(studentId: string): Promise<StudentFinancialSituation> {
  return getStudentFinancialSituation(studentId);
}

/** Never confirm the existence of another student's receipt (404, not 403). */
export async function getChildReceiptPdf(
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
