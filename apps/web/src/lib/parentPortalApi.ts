import { apiRequest, fetchBlob } from "./apiClient.js";
import type { AttendanceEntry } from "./attendanceApi.js";
import type { Announcement } from "./communicationApi.js";
import type { FamilyChildStudent } from "./familyApi.js";
import type { StudentFinancialSituation, StudentReceipt } from "./financeApi.js";
import type { ReportCard } from "./gradingApi.js";
import type { Homework } from "./homeworkApi.js";
import type { TimetableEntry } from "./timetableApi.js";

export type SubscriptionStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PENDING_ACTIVATION"
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export interface Subscription {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  billingPeriod: string;
  startsAt: string | null;
  currentPeriodEndsAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
}

export interface ParentDashboardChild {
  student: FamilyChildStudent;
  tenantName: string;
  recentAttendance: AttendanceEntry[];
  latestReportCard: ReportCard | null;
  financialSituation: StudentFinancialSituation;
  announcements: Announcement[];
}

export interface ParentDashboard {
  children: ParentDashboardChild[];
  subscription: Subscription | null;
}

export function getParentDashboard(accessToken: string): Promise<ParentDashboard> {
  return apiRequest("/parent-portal/dashboard", { accessToken });
}

export function getChildAttendance(studentId: string, accessToken: string): Promise<AttendanceEntry[]> {
  return apiRequest(`/parent-portal/children/${studentId}/attendance`, { accessToken });
}

export function getChildReportCards(studentId: string, accessToken: string): Promise<ReportCard[]> {
  return apiRequest(`/parent-portal/children/${studentId}/report-cards`, { accessToken });
}

export function getChildReportCard(
  studentId: string,
  reportCardId: string,
  accessToken: string,
): Promise<ReportCard> {
  return apiRequest(`/parent-portal/children/${studentId}/report-cards/${reportCardId}`, { accessToken });
}

export function fetchChildReportCardPdf(
  studentId: string,
  reportCardId: string,
  accessToken: string,
): Promise<Blob> {
  return fetchBlob(`/parent-portal/children/${studentId}/report-cards/${reportCardId}/pdf`, { accessToken });
}

export function getChildTimetable(studentId: string, accessToken: string): Promise<TimetableEntry[]> {
  return apiRequest(`/parent-portal/children/${studentId}/timetable`, { accessToken });
}

export function getChildAnnouncements(studentId: string, accessToken: string): Promise<Announcement[]> {
  return apiRequest(`/parent-portal/children/${studentId}/announcements`, { accessToken });
}

export function getChildHomework(studentId: string, accessToken: string): Promise<Homework[]> {
  return apiRequest(`/parent-portal/children/${studentId}/homework`, { accessToken });
}

export function getChildFinancialSituation(
  studentId: string,
  accessToken: string,
): Promise<StudentFinancialSituation> {
  return apiRequest(`/parent-portal/children/${studentId}/finance/situation`, { accessToken });
}

export interface ChildReceipt extends StudentReceipt {
  refundedCents: number;
}

export function getChildReceipts(studentId: string, accessToken: string): Promise<ChildReceipt[]> {
  return apiRequest(`/parent-portal/children/${studentId}/receipts`, { accessToken });
}

export function fetchChildReceiptPdf(
  studentId: string,
  receiptId: string,
  accessToken: string,
): Promise<Blob> {
  return fetchBlob(`/parent-portal/children/${studentId}/receipts/${receiptId}/pdf`, { accessToken });
}
