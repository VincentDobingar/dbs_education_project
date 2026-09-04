import { apiRequest, ApiError, type TenantCredentials } from "./apiClient.js";

export interface AssessmentType {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
}

export interface CreateAssessmentTypeInput {
  code: string;
  nameFr: string;
  nameEn: string;
}

export function listAssessmentTypes(creds: TenantCredentials): Promise<AssessmentType[]> {
  return apiRequest("/grading/assessment-types", { ...creds });
}

export function createAssessmentType(
  input: CreateAssessmentTypeInput,
  creds: TenantCredentials,
): Promise<AssessmentType> {
  return apiRequest("/grading/assessment-types", { method: "POST", body: input, ...creds });
}

export interface Assessment {
  id: string;
  subjectId: string;
  classroomId: string;
  assessmentTypeId: string;
  academicPeriodId: string;
  title: string;
  maxScore: string;
  coefficient: string;
  scheduledAt: string | null;
  isPublished: boolean;
}

export interface CreateAssessmentInput {
  subjectId: string;
  classroomId: string;
  assessmentTypeId: string;
  academicPeriodId: string;
  title: string;
  maxScore: number;
  coefficient?: number;
}

export function listAssessments(
  creds: TenantCredentials,
  query: { classroomId?: string; subjectId?: string; academicPeriodId?: string } = {},
): Promise<Assessment[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.academicPeriodId) params.set("academicPeriodId", query.academicPeriodId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/grading/assessments${suffix}`, { ...creds });
}

export function createAssessment(
  input: CreateAssessmentInput,
  creds: TenantCredentials,
): Promise<Assessment> {
  return apiRequest("/grading/assessments", { method: "POST", body: input, ...creds });
}

export function publishAssessment(id: string, creds: TenantCredentials): Promise<Assessment> {
  return apiRequest(`/grading/assessments/${id}/publish`, { method: "POST", ...creds });
}

export interface Grade {
  id: string;
  assessmentId: string;
  studentId: string;
  score: string | null;
  isAbsent: boolean;
  comment: string | null;
  isLocked: boolean;
}

export interface GradeEntryInput {
  studentId: string;
  score?: number;
  isAbsent?: boolean;
  comment?: string;
}

export function setGrades(
  assessmentId: string,
  grades: GradeEntryInput[],
  creds: TenantCredentials,
): Promise<Grade[]> {
  return apiRequest(`/grading/assessments/${assessmentId}/grades`, {
    method: "PUT",
    body: { grades },
    ...creds,
  });
}

export function listGradesForAssessment(assessmentId: string, creds: TenantCredentials): Promise<Grade[]> {
  return apiRequest(`/grading/assessments/${assessmentId}/grades`, { ...creds });
}

export function correctGrade(
  gradeId: string,
  input: { score?: number; isAbsent?: boolean; reason: string },
  creds: TenantCredentials,
): Promise<Grade> {
  return apiRequest(`/grading/grades/${gradeId}/correct`, { method: "PATCH", body: input, ...creds });
}

export interface ReportCardItem {
  id: string;
  reportCardId: string;
  subjectId: string;
  averageScore: string | null;
  coefficient: string | null;
}

export interface ReportCard {
  id: string;
  studentId: string;
  academicPeriodId: string;
  generatedAt: string;
  averageScore: string | null;
  classRank: number | null;
  mention: string | null;
  items?: ReportCardItem[];
}

export function generateReportCards(
  input: { classroomId: string; academicPeriodId: string },
  creds: TenantCredentials,
): Promise<ReportCard[]> {
  return apiRequest("/grading/report-cards/generate", { method: "POST", body: input, ...creds });
}

export function listReportCards(
  creds: TenantCredentials,
  query: { classroomId?: string; academicPeriodId?: string; studentId?: string } = {},
): Promise<ReportCard[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.academicPeriodId) params.set("academicPeriodId", query.academicPeriodId);
  if (query.studentId) params.set("studentId", query.studentId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/grading/report-cards${suffix}`, { ...creds });
}

const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api/v1";

// Not JSON, so it can't go through apiRequest — a raw fetch reusing the same
// auth/tenant headers, returning the PDF bytes for the caller to open/download.
export async function fetchReportCardPdf(id: string, creds: TenantCredentials): Promise<Blob> {
  const response = await fetch(`${API_URL}/grading/report-cards/${id}/pdf`, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "X-Tenant-Slug": creds.subdomain,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, "PDF_FETCH_FAILED", "Could not load the report card PDF");
  }
  return response.blob();
}
