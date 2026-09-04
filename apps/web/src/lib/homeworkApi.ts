import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Homework {
  id: string;
  classroomId: string;
  subjectId: string;
  createdByEmployeeId: string | null;
  title: string;
  instructions: string | null;
  dueAt: string;
}

export interface CreateHomeworkInput {
  classroomId: string;
  subjectId: string;
  title: string;
  instructions?: string;
  dueAt: string;
}

// Staff-side (tenant): assign and manage homework.
export function createHomework(input: CreateHomeworkInput, creds: TenantCredentials): Promise<Homework> {
  return apiRequest("/homework", { method: "POST", body: input, ...creds });
}

export function listHomework(
  creds: TenantCredentials,
  query: { classroomId?: string; subjectId?: string } = {},
): Promise<Homework[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.subjectId) params.set("subjectId", query.subjectId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/homework${suffix}`, { ...creds });
}

export function cancelHomework(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/homework/${id}`, { method: "DELETE", ...creds });
}

export type HomeworkSubmissionStatus = "ON_TIME" | "LATE";

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  content: string | null;
  fileUrl: string | null;
  status: HomeworkSubmissionStatus;
  submittedAt: string;
}

export function listSubmissions(homeworkId: string, creds: TenantCredentials): Promise<HomeworkSubmission[]> {
  return apiRequest(`/homework/${homeworkId}/submissions`, { ...creds });
}

// Student-side (self-service, no tenant): list the current classroom's homework and submit work.
export function listHomeworkForStudent(studentId: string, accessToken: string): Promise<Homework[]> {
  return apiRequest(`/homework/student/${studentId}`, { accessToken });
}

export function submitHomework(
  studentId: string,
  homeworkId: string,
  input: { content?: string; fileUrl?: string },
  accessToken: string,
): Promise<HomeworkSubmission> {
  return apiRequest(`/homework/student/${studentId}/${homeworkId}/submit`, {
    method: "POST",
    body: input,
    accessToken,
  });
}

export async function getMySubmission(
  studentId: string,
  homeworkId: string,
  accessToken: string,
): Promise<HomeworkSubmission | null> {
  try {
    return await apiRequest(`/homework/student/${studentId}/${homeworkId}/submission`, { accessToken });
  } catch {
    return null;
  }
}
