import type {
  Announcement,
  Attendance,
  Homework,
  ReportCard,
  Subscription,
  TimetableEntry,
} from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";
import { runWithContext } from "../../lib/tenant-context.js";
import * as attendanceService from "../attendance/attendance.service.js";
import { listAnnouncementsForStudent } from "../communication/announcement.service.js";
import { requireFamilyAccountForUser } from "../family/family-account.service.js";
import type { VerifiedChild } from "../family/parent-student-relationship.service.js";
import { listVerifiedChildrenForParent } from "../family/parent-student-relationship.service.js";
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
import { listHomeworkForStudent } from "../homework/homework.service.js";
import { listTimetableEntries, listTimetables } from "../school-config/timetable.service.js";
import { requireCurrentEnrollment } from "../students/student.service.js";
import { findSubscriptionForOwner } from "../subscriptions/subscription.service.js";

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
  return listAnnouncementsForStudent(studentId, "PARENTS");
}

/** §25 : lecture seule — le dépôt du travail reste une action de l'élève, jamais du
 * parent, mêmes devoirs que listHomeworkForStudent (§26). */
export async function getChildHomework(studentId: string): Promise<Homework[]> {
  return listHomeworkForStudent(studentId);
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

const RECENT_ATTENDANCE_LIMIT = 5;
const RECENT_ANNOUNCEMENTS_LIMIT = 5;

export interface ParentDashboardChild {
  student: VerifiedChild["student"];
  tenantName: string;
  recentAttendance: Attendance[];
  latestReportCard: ReportCard | null;
  financialSituation: StudentFinancialSituation;
  announcements: Announcement[];
}

export interface ParentDashboard {
  children: ParentDashboardChild[];
  subscription: Subscription | null;
}

/**
 * §18 "Parent" : un enfant par tenant potentiellement différent (§9) — chaque bloc
 * tourne sous `runWithContext` verrouillé sur LE tenant de cet enfant, exactement
 * comme `requireVerifiedStudentRelationship` le fait pour les routes à un seul
 * enfant ; jamais un contexte tenant partagé pour toute la liste. `subscription`
 * reste `null` si le parent n'a pas encore créé de `FamilyAccount` (§9 self-service,
 * désormais possible via `POST /family/family-account` — avant, cette ligne
 * n'existait jamais en pratique).
 */
export async function getParentDashboard(parentUserId: string): Promise<ParentDashboard> {
  const [children, familyAccount] = await Promise.all([
    listVerifiedChildrenForParent(parentUserId),
    requireFamilyAccountForUser(parentUserId).catch((err) => {
      if (err instanceof AppError && err.code === "FAMILY_ACCOUNT_NOT_FOUND") {
        return null;
      }
      throw err;
    }),
  ]);

  const subscription = familyAccount
    ? await findSubscriptionForOwner({ familyAccountId: familyAccount.id })
    : null;

  const childDashboards = await Promise.all(
    children.map((child) =>
      runWithContext({ tenantId: child.student.tenantId, userId: parentUserId }, async () => {
        const tenant = await rawPrisma.tenant.findUnique({ where: { id: child.student.tenantId } });

        let hasCurrentEnrollment = true;
        try {
          await requireCurrentEnrollment(child.student.id);
        } catch (err) {
          if (!(err instanceof AppError && err.code === "STUDENT_NOT_ENROLLED")) {
            throw err;
          }
          hasCurrentEnrollment = false;
        }

        const [recentAttendance, reportCards, financialSituation, announcements] = await Promise.all([
          attendanceService
            .listAttendance({ studentId: child.student.id })
            .then((rows) => rows.slice(0, RECENT_ATTENDANCE_LIMIT)),
          reportCardService.listReportCards({ studentId: child.student.id }),
          getStudentFinancialSituation(child.student.id),
          hasCurrentEnrollment
            ? listAnnouncementsForStudent(child.student.id, "PARENTS").then((items) =>
                items.slice(0, RECENT_ANNOUNCEMENTS_LIMIT),
              )
            : Promise.resolve([]),
        ]);

        // listReportCards orders by classRank, meaningless across different periods —
        // "latest" here means most recently generated, not top-ranked.
        const latestReportCard = reportCards.reduce<ReportCard | null>(
          (latest, reportCard) =>
            !latest || reportCard.generatedAt > latest.generatedAt ? reportCard : latest,
          null,
        );

        return {
          student: child.student,
          tenantName: tenant?.name ?? child.student.tenantId,
          recentAttendance,
          latestReportCard,
          financialSituation,
          announcements,
        };
      }),
    ),
  );

  return { children: childDashboards, subscription };
}
