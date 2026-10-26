import { apiRequest, type TenantCredentials } from "./apiClient.js";
export interface TeacherAssignment {
  id: string;
  classroomId: string;
  subjectId: string;
  academicYearId: string;
  classroom: { name: string };
  subject: { nameFr: string };
  academicYear: { name: string };
}
export interface TeacherAssessment {
  id: string;
  title: string;
  maxScore: string;
  isPublished: boolean;
  academicPeriodId: string;
}
export interface TeacherWorkspace {
  employee: { firstName: string; lastName: string; email: string | null };
  assignments: TeacherAssignment[];
  periods: { id: string; name: string }[];
  assessmentTypes: { id: string; nameFr: string }[];
  summary: {
    announcements: { id: string; title: string; body: string }[];
    upcomingHomework: { id: string; title: string; dueAt: string }[];
  };
}
export interface TeacherClassroom {
  students: { id: string; firstName: string; lastName: string; matricule: string }[];
  assessments: TeacherAssessment[];
}
export interface TeacherGrade {
  studentId: string;
  score: string | null;
  isAbsent: boolean;
}
const base = "/dashboard/enseignant";
export const getTeacherWorkspace = (c: TenantCredentials): Promise<TeacherWorkspace> =>
  apiRequest(`${base}/workspace`, c);
export const getTeacherClassroom = (id: string, c: TenantCredentials): Promise<TeacherClassroom> =>
  apiRequest(`${base}/assignments/${id}`, c);
export const getTeacherGrades = (
  id: string,
  assessmentId: string,
  c: TenantCredentials,
): Promise<TeacherGrade[]> => apiRequest(`${base}/assignments/${id}/assessments/${assessmentId}/grades`, c);
export const saveTeacherAttendance = (
  id: string,
  input: { date: string; entries: { studentId: string; status: string }[] },
  c: TenantCredentials,
) => apiRequest(`${base}/assignments/${id}/attendance`, { ...c, method: "POST", body: input });
export const saveTeacherGrades = (
  id: string,
  assessmentId: string,
  input: { grades: { studentId: string; score?: number; isAbsent: boolean }[] },
  c: TenantCredentials,
) =>
  apiRequest(`${base}/assignments/${id}/assessments/${assessmentId}/grades`, {
    ...c,
    method: "PUT",
    body: input,
  });
export const createTeacherAssessment = (
  id: string,
  input: { title: string; maxScore: number; academicPeriodId: string; assessmentTypeId: string },
  c: TenantCredentials,
): Promise<TeacherAssessment> =>
  apiRequest(`${base}/assignments/${id}/assessments`, { ...c, method: "POST", body: input });

export const getTeacherAttendance = (
  id: string,
  date: string,
  c: TenantCredentials,
): Promise<{ studentId: string; status: string }[]> =>
  apiRequest(`${base}/assignments/${id}/attendance?${new URLSearchParams({ date })}`, c);
