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

export type AcademicPeriodType = "TRIMESTER" | "SEMESTER" | "CUSTOM";

export interface AcademicPeriod {
  id: string;
  academicYearId: string;
  name: string;
  type: AcademicPeriodType;
  sequence: number;
  startDate: string;
  endDate: string;
}

export interface CreateAcademicPeriodInput {
  name: string;
  type: AcademicPeriodType;
  sequence: number;
  startDate: string;
  endDate: string;
}

export function listAcademicPeriods(
  academicYearId: string,
  creds: TenantCredentials,
): Promise<AcademicPeriod[]> {
  return apiRequest(`/school-config/academic-years/${academicYearId}/periods`, { ...creds });
}

export function createAcademicPeriod(
  academicYearId: string,
  input: CreateAcademicPeriodInput,
  creds: TenantCredentials,
): Promise<AcademicPeriod> {
  return apiRequest(`/school-config/academic-years/${academicYearId}/periods`, {
    method: "POST",
    body: input,
    ...creds,
  });
}

export interface Subject {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  departmentId: string | null;
}

export interface CreateSubjectInput {
  code: string;
  nameFr: string;
  nameEn: string;
}

export function listSubjects(creds: TenantCredentials): Promise<Subject[]> {
  return apiRequest("/school-config/subjects", { ...creds });
}

export function createSubject(input: CreateSubjectInput, creds: TenantCredentials): Promise<Subject> {
  return apiRequest("/school-config/subjects", { method: "POST", body: input, ...creds });
}

// §20 : salles comme entité propre.
export interface Room {
  id: string;
  name: string;
  campusId: string | null;
  capacity: number | null;
  deletedAt: string | null;
}

export interface CreateRoomInput {
  name: string;
  campusId?: string;
  capacity?: number;
}

export function listRooms(creds: TenantCredentials, campusId?: string): Promise<Room[]> {
  const query = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";
  return apiRequest(`/school-config/rooms${query}`, { ...creds });
}

export function createRoom(input: CreateRoomInput, creds: TenantCredentials): Promise<Room> {
  return apiRequest("/school-config/rooms", { method: "POST", body: input, ...creds });
}

export function archiveRoom(id: string, creds: TenantCredentials): Promise<Room> {
  return apiRequest(`/school-config/rooms/${id}/archive`, { method: "POST", ...creds });
}

// §20 : calendrier / jours fériés dédié.
export type CalendarEventType = "HOLIDAY" | "EXAM_PERIOD" | "SCHOOL_EVENT" | "OTHER";

export interface CalendarEvent {
  id: string;
  academicYearId: string | null;
  type: CalendarEventType;
  title: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
}

export interface CreateCalendarEventInput {
  academicYearId?: string;
  type: CalendarEventType;
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

export function listCalendarEvents(
  creds: TenantCredentials,
  query: { academicYearId?: string } = {},
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams();
  if (query.academicYearId) params.set("academicYearId", query.academicYearId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/school-config/calendar-events${suffix}`, { ...creds });
}

export function createCalendarEvent(
  input: CreateCalendarEventInput,
  creds: TenantCredentials,
): Promise<CalendarEvent> {
  return apiRequest("/school-config/calendar-events", { method: "POST", body: input, ...creds });
}

export function removeCalendarEvent(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/school-config/calendar-events/${id}`, { method: "DELETE", ...creds });
}
