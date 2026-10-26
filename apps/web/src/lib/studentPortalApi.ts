import { apiRequest, apiUpload, fetchBlob } from "./apiClient.js";
import type { AttendanceEntry } from "./attendanceApi.js";
import type { Announcement } from "./communicationApi.js";
import type { StudentInvoice, StudentReceipt } from "./financeApi.js";
import type { ReportCard } from "./gradingApi.js";
import type { Homework } from "./homeworkApi.js";
import type { Subscription } from "./parentPortalApi.js";
import type { TimetableEntry } from "./timetableApi.js";

export interface StudentGrade {
  id: string;
  score: string | null;
  isAbsent: boolean;
  comment: string | null;
  assessment: {
    title: string;
    maxScore: string;
    scheduledAt: string | null;
    subject: { nameFr: string; nameEn: string };
  };
}
export function getStudentGrades(studentId: string, accessToken: string): Promise<StudentGrade[]> {
  return apiRequest(`/student-portal/students/${studentId}/grades`, { accessToken, authContext: "portal" });
}
export function getStudentAttendance(studentId: string, accessToken: string): Promise<AttendanceEntry[]> {
  return apiRequest(`/student-portal/students/${studentId}/attendance`, {
    accessToken,
    authContext: "portal",
  });
}

export interface StudentEnrollmentSummary {
  classroomId: string;
  academicYearId: string;
  classroomName: string;
  academicYearName: string;
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
    photoUrl: string | null;
    address: string | null;
    phone: string | null;
    birthPlace: string | null;
    nationality: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
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

export function getStudentInvoices(studentId: string, accessToken: string): Promise<StudentInvoice[]> {
  return apiRequest(`/student-portal/students/${studentId}/invoices`, { accessToken });
}
export function fetchStudentInvoicePdf(
  studentId: string,
  invoiceId: string,
  accessToken: string,
): Promise<Blob> {
  return fetchBlob(`/student-portal/students/${studentId}/invoices/${invoiceId}/pdf`, { accessToken });
}

export function fetchStudentIdCardPdf(studentId: string, accessToken: string): Promise<Blob> {
  return fetchBlob(`/student-portal/students/${studentId}/id-card`, { accessToken });
}

export type StudentContactInput = Pick<
  StudentProfile["student"],
  "address" | "phone" | "birthPlace" | "nationality" | "emergencyContactName" | "emergencyContactPhone"
>;
export function updateMyStudentProfile(studentId: string, input: StudentContactInput, accessToken: string) {
  return apiRequest(`/student-portal/students/${studentId}/profile`, {
    method: "PATCH",
    body: input,
    accessToken,
    authContext: "portal",
  });
}
export function uploadMyStudentPhoto(studentId: string, file: File, accessToken: string) {
  return apiUpload(`/student-portal/students/${studentId}/photo`, "photo", file, {
    accessToken,
    authContext: "portal",
  });
}
