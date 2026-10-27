import { apiRequest, apiUpload, fetchBlob, type TenantCredentials } from "./apiClient.js";

export interface Student {
  primaryGuardianId?: string | null;
  primaryGuardian?: { firstName: string; lastName: string } | null;
  enrollments?: { classroom: { name: string }; academicYear: { name: string } }[];
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  photoUrl: string | null;
  address?: string | null;
  phone?: string | null;
  birthPlace?: string | null;
  nationality?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  status: string;
  updatedAt?: string;
  possibleDuplicates?: { id: string; matricule: string; firstName: string; lastName: string }[];
}

export interface CreateStudentInput {
  primaryGuardianId?: string;
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
  registrationPeriodId: string;
  academicYearId: string;
  classroomId: string;
  campusId: string;
  gradeLevelId: string;
  /** Échéancier flexible : tarifs facultatifs choisis, remises prédéfinies ou au cas par cas. */
  optionalFeeStructureIds?: string[];
  discountPresetIds?: string[];
  manualDiscounts?: { label: string; kind: "PERCENT" | "AMOUNT"; value: number; reason: string }[];
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

export function fetchClassIdCardsPdf(classroomId: string, creds: TenantCredentials): Promise<Blob> {
  return fetchBlob(`/students/classrooms/${classroomId}/id-cards`, { ...creds });
}

export interface UpdateStudentProfileInput {
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  phone: string | null;
  birthPlace: string | null;
  nationality: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}
export function updateStudentProfile(
  id: string,
  input: UpdateStudentProfileInput,
  creds: TenantCredentials,
): Promise<Student> {
  return apiRequest(`/students/${id}`, { method: "PATCH", body: input, ...creds });
}
export function uploadStudentPhoto(
  id: string,
  file: File,
  creds: TenantCredentials,
): Promise<{ photoUrl: string }> {
  return apiUpload(`/students/${id}/photo`, "photo", file, { ...creds });
}
