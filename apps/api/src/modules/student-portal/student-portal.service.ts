import type {
  Announcement,
  Homework,
  ReportCard,
  Student,
  Subscription,
  TimetableEntry,
} from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { listAnnouncementsForStudent } from "../communication/announcement.service.js";
import { generateReceiptPdf } from "../finance/receipt-pdf.service.js";
import { requireStudentInvoice } from "../finance/student-invoice.service.js";
import { listReceiptsForStudent, requireReceipt } from "../finance/student-payment.service.js";
import type { StudentReceiptWithRefund } from "../finance/student-payment.service.js";
import { generateReportCardPdf } from "../grading/report-card-pdf.service.js";
import * as reportCardService from "../grading/report-card.service.js";
import type { ReportCardWithItems } from "../grading/report-card.service.js";
import { listHomeworkForStudent } from "../homework/homework.service.js";
import { listTimetableEntries, listTimetables } from "../school-config/timetable.service.js";
import { getStudent, requireCurrentEnrollment } from "../students/student.service.js";
import type { CurrentEnrollment } from "../students/student.service.js";
import { findSubscriptionForOwner } from "../subscriptions/subscription.service.js";

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

export async function getMyReceipts(studentId: string): Promise<StudentReceiptWithRefund[]> {
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

const RECENT_REPORT_CARDS_LIMIT = 3;
const RECENT_ANNOUNCEMENTS_LIMIT = 5;
const UPCOMING_HOMEWORK_LIMIT = 5;

/** Schéma : TimetableEntry.dayOfWeek 0 = lundi ... 6 = dimanche — JS Date#getDay() est 0 = dimanche. */
function schemaDayOfWeek(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export interface StudentDashboard {
  profile: StudentProfile;
  todayClasses: TimetableEntry[];
  recentReportCards: ReportCard[];
  announcements: Announcement[];
  upcomingHomework: Homework[];
  subscription: Subscription | null;
}

/**
 * §18 "Élève" : bundle read-only des endpoints déjà exposés individuellement par ce
 * module, pour éviter un aller-retour par bloc côté client. "Calendrier" (§18) reste
 * hors périmètre — aucun modèle d'événements/jours fériés n'existe (même gap déjà
 * noté en §20).
 */
export async function getMyDashboard(studentId: string): Promise<StudentDashboard> {
  const profile = await getStudentProfile(studentId);

  const todayClasses = profile.currentEnrollment
    ? (await getMyTimetable(studentId)).filter((entry) => entry.dayOfWeek === schemaDayOfWeek(new Date()))
    : [];

  const [recentReportCards, announcements, upcomingHomework, subscription] = await Promise.all([
    reportCardService
      .listReportCards({ studentId })
      .then((reportCards) => reportCards.slice(0, RECENT_REPORT_CARDS_LIMIT)),
    // listAnnouncementsForStudent requires a current enrollment (to resolve CLASSROOM-
    // scoped announcements) — a PROSPECTIVE student without one yet simply sees none.
    profile.currentEnrollment
      ? listAnnouncementsForStudent(studentId, "STUDENTS").then((items) =>
          items.slice(0, RECENT_ANNOUNCEMENTS_LIMIT),
        )
      : Promise.resolve([]),
    // Même garde qu'au-dessus : listHomeworkForStudent exige une inscription active.
    profile.currentEnrollment
      ? listHomeworkForStudent(studentId).then((items) =>
          items.filter((h) => h.dueAt >= new Date()).slice(0, UPCOMING_HOMEWORK_LIMIT),
        )
      : Promise.resolve([]),
    findSubscriptionForOwner({ studentId }),
  ]);

  return { profile, todayClasses, recentReportCards, announcements, upcomingHomework, subscription };
}
