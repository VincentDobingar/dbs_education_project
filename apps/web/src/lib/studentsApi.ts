import { apiRequest, fetchBlob, type TenantCredentials } from "./apiClient.js";

export interface Student {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  photoUrl: string | null;
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

export function listStudents(creds: TenantCredentials, classroomId?: string): Promise<Student[]> {
  const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : "";
  return apiRequest(`/students${query}`, { ...creds });
}

export interface PaginatedStudents {
  data: Student[];
  total: number;
}

// Réservé à la liste complète de l'établissement (StudentsPage) — potentiellement
// des milliers de lignes pour un gros établissement, contrairement aux rosters de
// classe (listStudents ci-dessus) qui restent volontairement non paginés.
export function listStudentsPage(
  creds: TenantCredentials,
  page: number,
  pageSize = 50,
): Promise<PaginatedStudents> {
  return apiRequest(`/students?page=${page}&pageSize=${pageSize}`, { ...creds });
}

export function createStudent(input: CreateStudentInput, creds: TenantCredentials): Promise<Student> {
  return apiRequest("/students", { method: "POST", body: input, ...creds });
}

export function getStudent(id: string, creds: TenantCredentials): Promise<Student> {
  return apiRequest(`/students/${id}`, { ...creds });
}

// §19 : photo sur la carte scolaire — le seul champ que cette page a besoin de
// modifier après création pour l'instant, donc typé étroitement plutôt qu'avec
// l'ensemble des champs PATCH-ables côté backend.
export function updateStudentPhoto(id: string, photoUrl: string, creds: TenantCredentials): Promise<Student> {
  return apiRequest(`/students/${id}`, { method: "PATCH", body: { photoUrl }, ...creds });
}

export function fetchIdCardPdf(id: string, creds: TenantCredentials): Promise<Blob> {
  return fetchBlob(`/students/${id}/id-card`, creds);
}

export function fetchStudentsExportCsv(creds: TenantCredentials): Promise<Blob> {
  return fetchBlob("/students/export", creds);
}

export function fetchStudentsExportXlsx(creds: TenantCredentials): Promise<Blob> {
  return fetchBlob("/students/export.xlsx", creds);
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
