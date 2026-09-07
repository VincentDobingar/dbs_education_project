import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Timetable {
  id: string;
  classroomId: string;
  academicYearId: string;
  name: string | null;
}

export interface CreateTimetableInput {
  classroomId: string;
  academicYearId: string;
  name?: string;
}

export function listTimetables(
  creds: TenantCredentials,
  query: { classroomId?: string; academicYearId?: string } = {},
): Promise<Timetable[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.academicYearId) params.set("academicYearId", query.academicYearId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/school-config/timetables${suffix}`, { ...creds });
}

export function createTimetable(input: CreateTimetableInput, creds: TenantCredentials): Promise<Timetable> {
  return apiRequest("/school-config/timetables", { method: "POST", body: input, ...creds });
}

export interface TimetableEntry {
  id: string;
  timetableId: string;
  subjectId: string;
  teacherEmployeeId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomLabel: string | null;
  roomId: string | null;
}

export interface CreateTimetableEntryInput {
  subjectId: string;
  teacherEmployeeId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomLabel?: string;
  roomId?: string;
}

export function listTimetableEntries(
  timetableId: string,
  creds: TenantCredentials,
): Promise<TimetableEntry[]> {
  return apiRequest(`/school-config/timetables/${timetableId}/entries`, { ...creds });
}

export function addTimetableEntry(
  timetableId: string,
  input: CreateTimetableEntryInput,
  creds: TenantCredentials,
): Promise<TimetableEntry> {
  return apiRequest(`/school-config/timetables/${timetableId}/entries`, {
    method: "POST",
    body: input,
    ...creds,
  });
}

export function removeTimetableEntry(
  timetableId: string,
  entryId: string,
  creds: TenantCredentials,
): Promise<void> {
  return apiRequest(`/school-config/timetables/${timetableId}/entries/${entryId}`, {
    method: "DELETE",
    ...creds,
  });
}
