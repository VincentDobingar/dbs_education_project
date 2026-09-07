import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface OnlineCourse {
  id: string;
  classroomId: string;
  subjectId: string;
  createdByEmployeeId: string | null;
  title: string;
  description: string | null;
  deletedAt: string | null;
}

export function listCourses(
  query: { classroomId?: string; subjectId?: string },
  creds: TenantCredentials,
): Promise<OnlineCourse[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.subjectId) params.set("subjectId", query.subjectId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/elearning/courses${suffix}`, { ...creds });
}

export function createCourse(
  input: { classroomId: string; subjectId: string; title: string; description?: string },
  creds: TenantCredentials,
): Promise<OnlineCourse> {
  return apiRequest("/elearning/courses", { method: "POST", body: input, ...creds });
}

export function cancelCourse(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/elearning/courses/${id}`, { method: "DELETE", ...creds });
}

export type LearningResourceType = "VIDEO" | "DOCUMENT" | "LINK" | "TEXT";

export interface CourseResource {
  id: string;
  courseId: string;
  title: string;
  type: LearningResourceType;
  url: string | null;
  content: string | null;
  order: number;
}

export function listResources(courseId: string, creds: TenantCredentials): Promise<CourseResource[]> {
  return apiRequest(`/elearning/courses/${courseId}/resources`, { ...creds });
}

export function addResource(
  courseId: string,
  input: { title: string; type: LearningResourceType; url?: string; content?: string; order?: number },
  creds: TenantCredentials,
): Promise<CourseResource> {
  return apiRequest(`/elearning/courses/${courseId}/resources`, { method: "POST", body: input, ...creds });
}

export function removeResource(
  courseId: string,
  resourceId: string,
  creds: TenantCredentials,
): Promise<void> {
  return apiRequest(`/elearning/courses/${courseId}/resources/${resourceId}`, {
    method: "DELETE",
    ...creds,
  });
}

export interface ResourceProgress {
  id: string;
  resourceId: string;
  studentId: string;
  completedAt: string;
}

export function listProgress(courseId: string, creds: TenantCredentials): Promise<ResourceProgress[]> {
  return apiRequest(`/elearning/courses/${courseId}/progress`, { ...creds });
}

// Self-service élève (§25/§26) : jamais TenantCredentials, résolu par studentId via
// requireLinkedStudent() côté serveur — même raisonnement que homeworkApi.ts.

export function listCoursesForStudent(studentId: string, accessToken: string): Promise<OnlineCourse[]> {
  return apiRequest(`/elearning/student/${studentId}/courses`, { accessToken });
}

export interface CourseWithProgress extends OnlineCourse {
  resources: CourseResource[];
  completedResourceIds: string[];
}

export function getCourseForStudent(
  studentId: string,
  courseId: string,
  accessToken: string,
): Promise<CourseWithProgress> {
  return apiRequest(`/elearning/student/${studentId}/courses/${courseId}`, { accessToken });
}

export function markResourceComplete(
  studentId: string,
  courseId: string,
  resourceId: string,
  accessToken: string,
): Promise<ResourceProgress> {
  return apiRequest(`/elearning/student/${studentId}/courses/${courseId}/resources/${resourceId}/complete`, {
    method: "POST",
    accessToken,
  });
}
