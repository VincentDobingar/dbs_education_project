import { apiRequest, fetchBlob } from "./apiClient.js";
import type { Announcement } from "./communicationApi.js";
import type { StudentReceipt } from "./financeApi.js";
import type { ReportCard } from "./gradingApi.js";
import type { Homework } from "./homeworkApi.js";
import type { Subscription } from "./parentPortalApi.js";
import type { TimetableEntry } from "./timetableApi.js";

export interface StudentEnrollmentSummary {
  classroomId: string;
  academicYearId: string;
  status: string;
}

export interface StudentProfile {
  student: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    gender: string | null;
    status: string;
  };
  currentEnrollment: StudentEnrollmentSummary | null;
}

export interface StudentDashboard {
  profile: StudentProfile;
  todayClasses: TimetableEntry[];
  recentReportCards: ReportCard[];
  announcements: Announcement[];
  upcomingHomework: Homework[];
  subscription: Subscription | null;
}

export function getStudentDashboard(studentId: string, accessToken: string): Promise<StudentDashboard> {
  return apiRequest(`/student-portal/students/${studentId}/dashboard`, { accessToken });
}

export function getStudentProfile(studentId: string, accessToken: string): Promise<StudentProfile> {
  return apiRequest(`/student-portal/students/${studentId}/profile`, { accessToken });
}

export function getStudentTimetable(studentId: string, accessToken: string): Promise<TimetableEntry[]> {
  return apiRequest(`/student-portal/students/${studentId}/timetable`, { accessToken });
}

export function getStudentReportCards(studentId: string, accessToken: string): Promise<ReportCard[]> {
  return apiRequest(`/student-portal/students/${studentId}/report-cards`, { accessToken });
}

export function fetchStudentReportCardPdf(
  studentId: string,
  reportCardId: string,
  accessToken: string,
): Promise<Blob> {
  return fetchBlob(`/student-portal/students/${studentId}/report-cards/${reportCardId}/pdf`, { accessToken });
}

export function getStudentAnnouncements(studentId: string, accessToken: string): Promise<Announcement[]> {
  return apiRequest(`/student-portal/students/${studentId}/announcements`, { accessToken });
}

export interface StudentReceiptWithRefund extends StudentReceipt {
  refundedCents: number;
}

export function getStudentReceipts(
  studentId: string,
  accessToken: string,
): Promise<StudentReceiptWithRefund[]> {
  return apiRequest(`/student-portal/students/${studentId}/receipts`, { accessToken });
}

export function fetchStudentReceiptPdf(
  studentId: string,
  receiptId: string,
  accessToken: string,
): Promise<Blob> {
  return fetchBlob(`/student-portal/students/${studentId}/receipts/${receiptId}/pdf`, { accessToken });
}
