import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Campus {
  id: string;
  name: string;
  code: string;
  isMain: boolean;
}

export interface CreateCampusInput {
  name: string;
  code: string;
  isMain?: boolean;
}

export function listCampuses(creds: TenantCredentials): Promise<Campus[]> {
  return apiRequest("/school-config/campuses", { ...creds });
}

export function createCampus(input: CreateCampusInput, creds: TenantCredentials): Promise<Campus> {
  return apiRequest("/school-config/campuses", { method: "POST", body: input, ...creds });
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CreateAcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
}

export function listAcademicYears(creds: TenantCredentials): Promise<AcademicYear[]> {
  return apiRequest("/school-config/academic-years", { ...creds });
}

export function createAcademicYear(
  input: CreateAcademicYearInput,
  creds: TenantCredentials,
): Promise<AcademicYear> {
  return apiRequest("/school-config/academic-years", { method: "POST", body: input, ...creds });
}

export interface EducationCycle {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
}

export interface CreateEducationCycleInput {
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
}

export function listEducationCycles(creds: TenantCredentials): Promise<EducationCycle[]> {
  return apiRequest("/school-config/education-cycles", { ...creds });
}

export function createEducationCycle(
  input: CreateEducationCycleInput,
  creds: TenantCredentials,
): Promise<EducationCycle> {
  return apiRequest("/school-config/education-cycles", { method: "POST", body: input, ...creds });
}

export interface GradeLevel {
  id: string;
  cycleId: string;
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
}

export interface CreateGradeLevelInput {
  code: string;
  nameFr: string;
  nameEn: string;
  order: number;
}

export function listGradeLevels(creds: TenantCredentials): Promise<GradeLevel[]> {
  return apiRequest("/school-config/grade-levels", { ...creds });
}

export function createGradeLevel(
  cycleId: string,
  input: CreateGradeLevelInput,
  creds: TenantCredentials,
): Promise<GradeLevel> {
  return apiRequest(`/school-config/education-cycles/${cycleId}/grade-levels`, {
    method: "POST",
    body: input,
    ...creds,
  });
}

export interface Classroom {
  id: string;
  name: string;
  academicYearId: string;
  campusId: string;
  gradeLevelId: string;
  capacity: number | null;
}

export interface CreateClassroomInput {
  name: string;
  academicYearId: string;
  campusId: string;
  gradeLevelId: string;
  capacity?: number;
}

export function listClassrooms(creds: TenantCredentials): Promise<Classroom[]> {
  return apiRequest("/school-config/classrooms", { ...creds });
}

export function createClassroom(input: CreateClassroomInput, creds: TenantCredentials): Promise<Classroom> {
  return apiRequest("/school-config/classrooms", { method: "POST", body: input, ...creds });
}
