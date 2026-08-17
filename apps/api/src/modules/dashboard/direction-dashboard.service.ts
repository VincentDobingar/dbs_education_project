import type { EmployeeStatus, StudentStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { getExpenseReport, getRevenueReport } from "../finance/financial-report.service.js";

import type { DashboardWindowQuery } from "./dashboard.validation.js";

const DEFAULT_WINDOW_DAYS = 30;
const UNPAID_STATUSES = new Set(["ISSUED", "PARTIALLY_PAID"]);

export interface DirectionDashboard {
  windowDays: number;
  students: {
    total: number;
    byStatus: Record<StudentStatus, number>;
    byGender: { gender: string; count: number }[];
    byClassroom: { classroomId: string; classroomName: string; count: number }[];
    recentEnrollments: number;
  };
  staff: {
    total: number;
    byStatus: Record<EmployeeStatus, number>;
  };
  attendance: {
    presentCount: number;
    totalCount: number;
    presenceRate: number | null;
  };
  academics: {
    reportCardCount: number;
    averageScore: number | null;
  };
  finance: {
    totalInvoicedCents: number;
    totalPaidCents: number;
    outstandingCents: number;
    overdueInvoiceCount: number;
    overdueCents: number;
    recentRevenueCents: number;
    recentExpensesCents: number;
  };
  discipline: {
    recentIncidentCount: number;
  };
}

function emptyCountRecord<T extends string>(values: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const value of values) {
    record[value] = 0;
  }
  return record;
}

const STUDENT_STATUSES: StudentStatus[] = [
  "PROSPECTIVE",
  "ACTIVE",
  "TRANSFERRED",
  "GRADUATED",
  "WITHDRAWN",
  "ARCHIVED",
];
const EMPLOYEE_STATUSES: EmployeeStatus[] = ["ACTIVE", "ON_LEAVE", "TERMINATED"];

async function summarizeStudents(since: Date): Promise<DirectionDashboard["students"]> {
  const [byStatusGrouped, byGenderGrouped, enrollments, recentEnrollments] = await Promise.all([
    prisma.student.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.student.groupBy({
      by: ["gender"],
      where: { deletedAt: null, gender: { not: null } },
      _count: { _all: true },
    }),
    prisma.enrollment.groupBy({
      by: ["classroomId"],
      where: { deletedAt: null, status: { in: ["ENROLLED", "RE_ENROLLED"] } },
      _count: { _all: true },
    }),
    prisma.enrollment.count({ where: { deletedAt: null, enrolledAt: { gte: since } } }),
  ]);

  const byStatus = emptyCountRecord(STUDENT_STATUSES);
  for (const row of byStatusGrouped) {
    byStatus[row.status] = row._count._all;
  }

  const classrooms = await prisma.classroom.findMany({
    where: { id: { in: enrollments.map((row) => row.classroomId) } },
    select: { id: true, name: true },
  });
  const classroomNameById = new Map(classrooms.map((classroom) => [classroom.id, classroom.name]));

  return {
    total: byStatusGrouped.reduce((sum, row) => sum + row._count._all, 0),
    byStatus,
    byGender: byGenderGrouped.map((row) => ({ gender: row.gender ?? "—", count: row._count._all })),
    byClassroom: enrollments.map((row) => ({
      classroomId: row.classroomId,
      classroomName: classroomNameById.get(row.classroomId) ?? row.classroomId,
      count: row._count._all,
    })),
    recentEnrollments,
  };
}

async function summarizeStaff(): Promise<DirectionDashboard["staff"]> {
  const grouped = await prisma.employee.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const byStatus = emptyCountRecord(EMPLOYEE_STATUSES);
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }
  return { total: grouped.reduce((sum, row) => sum + row._count._all, 0), byStatus };
}

async function summarizeAttendance(since: Date): Promise<DirectionDashboard["attendance"]> {
  const grouped = await prisma.attendance.groupBy({
    by: ["status"],
    where: { date: { gte: since } },
    _count: { _all: true },
  });
  const totalCount = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const presentCount = grouped.find((row) => row.status === "PRESENT")?._count._all ?? 0;
  return { presentCount, totalCount, presenceRate: totalCount > 0 ? presentCount / totalCount : null };
}

/**
 * Toutes périodes confondues, faute d'un moyen simple de déterminer "la période
 * académique en cours" indépendamment de chaque bulletin (§21 n'a pas de notion de
 * période "courante" comme AcademicYear.isCurrent) — une moyenne établissement plus
 * fine par période resterait à affiner plus tard.
 */
async function summarizeAcademics(): Promise<DirectionDashboard["academics"]> {
  const reportCards = await prisma.reportCard.findMany({ select: { averageScore: true } });
  const withAverage = reportCards.filter(
    (reportCard): reportCard is { averageScore: NonNullable<typeof reportCard.averageScore> } =>
      reportCard.averageScore !== null,
  );
  const averageScore =
    withAverage.length > 0
      ? withAverage.reduce((sum, reportCard) => sum + reportCard.averageScore.toNumber(), 0) /
        withAverage.length
      : null;
  return { reportCardCount: reportCards.length, averageScore };
}

async function summarizeFinance(windowDays: number): Promise<DirectionDashboard["finance"]> {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [invoices, revenueReport, expenseReport] = await Promise.all([
    prisma.studentInvoice.findMany({
      where: { deletedAt: null, status: { not: "CANCELLED" } },
      select: { totalCents: true, paidCents: true, status: true, dueAt: true },
    }),
    getRevenueReport({ startDate: since, endDate: now }),
    getExpenseReport({ startDate: since, endDate: now }),
  ]);

  const totalInvoicedCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const totalPaidCents = invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0);
  const overdueInvoices = invoices.filter(
    (invoice) => UNPAID_STATUSES.has(invoice.status) && invoice.dueAt !== null && invoice.dueAt < now,
  );

  return {
    totalInvoicedCents,
    totalPaidCents,
    outstandingCents: totalInvoicedCents - totalPaidCents,
    overdueInvoiceCount: overdueInvoices.length,
    overdueCents: overdueInvoices.reduce((sum, invoice) => sum + (invoice.totalCents - invoice.paidCents), 0),
    recentRevenueCents: revenueReport.grossRevenueCents,
    recentExpensesCents: expenseReport.totalExpensesCents,
  };
}

async function summarizeDiscipline(since: Date): Promise<DirectionDashboard["discipline"]> {
  const recentIncidentCount = await prisma.disciplinaryIncident.count({
    where: { deletedAt: null, occurredAt: { gte: since } },
  });
  return { recentIncidentCount };
}

/**
 * §18 "Direction" : snapshot en lecture seule, agrégé en mémoire/`groupBy` (même
 * style que stats-admin.service.ts, §31 tranche 9). Volontairement hors périmètre,
 * faute de modèle : "alertes" et "activité récente" génériques (même limite déjà
 * documentée côté super-admin).
 */
export async function getDirectionDashboard(query: DashboardWindowQuery): Promise<DirectionDashboard> {
  const windowDays = query.windowDays ?? DEFAULT_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [students, staff, attendance, academics, finance, discipline] = await Promise.all([
    summarizeStudents(since),
    summarizeStaff(),
    summarizeAttendance(since),
    summarizeAcademics(),
    summarizeFinance(windowDays),
    summarizeDiscipline(since),
  ]);

  return { windowDays, students, staff, attendance, academics, finance, discipline };
}
