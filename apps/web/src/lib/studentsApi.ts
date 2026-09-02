import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Student {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  possibleDuplicates?: { id: string; matricule: string; firstName: string; lastName: string }[];
}

export interface CreateStudentInput {
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
}

export function listStudents(creds: TenantCredentials): Promise<Student[]> {
  return apiRequest("/students", { ...creds });
}

export function createStudent(input: CreateStudentInput, creds: TenantCredentials): Promise<Student> {
  return apiRequest("/students", { method: "POST", body: input, ...creds });
}

export function getStudent(id: string, creds: TenantCredentials): Promise<Student> {
  return apiRequest(`/students/${id}`, { ...creds });
}

export interface Enrollment {
  id: string;
  studentId: string;
  academicYearId: string;
  classroomId: string;
  campusId: string;
  gradeLevelId: string;
  status: string;
  enrolledAt: string;
}

export interface CreateEnrollmentInput {
  academicYearId: string;
  classroomId: string;
  campusId: string;
  gradeLevelId: string;
}

export function listEnrollments(studentId: string, creds: TenantCredentials): Promise<Enrollment[]> {
  return apiRequest(`/students/${studentId}/enrollments`, { ...creds });
}

export function enrollStudent(
  studentId: string,
  input: CreateEnrollmentInput,
  creds: TenantCredentials,
): Promise<Enrollment> {
  return apiRequest(`/students/${studentId}/enrollments`, { method: "POST", body: input, ...creds });
}
