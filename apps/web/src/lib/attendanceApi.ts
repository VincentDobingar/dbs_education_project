import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceEntry {
  id: string;
  studentId: string;
  classroomId: string;
  date: string;
  status: AttendanceStatus;
  justificationNote: string | null;
}

export interface RecordRollCallInput {
  classroomId: string;
  date: string;
  entries: { studentId: string; status: AttendanceStatus }[];
}

export function recordRollCall(
  input: RecordRollCallInput,
  creds: TenantCredentials,
): Promise<AttendanceEntry[]> {
  return apiRequest("/attendance/roll-call", { method: "PUT", body: input, ...creds });
}

export function listAttendance(
  creds: TenantCredentials,
  query: { classroomId?: string; date?: string } = {},
): Promise<AttendanceEntry[]> {
  const params = new URLSearchParams();
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.date) params.set("date", query.date);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/attendance${suffix}`, { ...creds });
}
