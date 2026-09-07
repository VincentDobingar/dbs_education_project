import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface DormitoryRoom {
  id: string;
  name: string;
  capacity: number;
  deletedAt: string | null;
}

export function listRooms(creds: TenantCredentials): Promise<DormitoryRoom[]> {
  return apiRequest("/boarding/rooms", { ...creds });
}

export function createRoom(
  input: { name: string; capacity: number },
  creds: TenantCredentials,
): Promise<DormitoryRoom> {
  return apiRequest("/boarding/rooms", { method: "POST", body: input, ...creds });
}

export function archiveRoom(id: string, creds: TenantCredentials): Promise<DormitoryRoom> {
  return apiRequest(`/boarding/rooms/${id}/archive`, { method: "POST", ...creds });
}

export interface StudentBedAssignment {
  id: string;
  studentId: string;
  bedId: string;
  startDate: string;
  endDate: string | null;
}

export interface DormitoryBed {
  id: string;
  roomId: string;
  label: string;
  assignment: StudentBedAssignment | null;
}

export function listBeds(roomId: string, creds: TenantCredentials): Promise<DormitoryBed[]> {
  return apiRequest(`/boarding/rooms/${roomId}/beds`, { ...creds });
}

export function addBed(roomId: string, label: string, creds: TenantCredentials): Promise<DormitoryBed> {
  return apiRequest(`/boarding/rooms/${roomId}/beds`, { method: "POST", body: { label }, ...creds });
}

export function removeBed(roomId: string, bedId: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/boarding/rooms/${roomId}/beds/${bedId}`, { method: "DELETE", ...creds });
}

export function assignStudent(
  roomId: string,
  bedId: string,
  input: { studentId: string; startDate: string; endDate?: string },
  creds: TenantCredentials,
): Promise<StudentBedAssignment> {
  return apiRequest(`/boarding/rooms/${roomId}/beds/${bedId}/assign`, {
    method: "POST",
    body: input,
    ...creds,
  });
}

export function unassignStudent(studentId: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/boarding/students/${studentId}/assignment`, { method: "DELETE", ...creds });
}

export type DormitoryAttendanceStatus = "PRESENT" | "ABSENT";

export interface DormitoryAttendance {
  id: string;
  assignmentId: string;
  date: string;
  status: DormitoryAttendanceStatus;
}

export function listDormitoryAttendance(
  studentId: string,
  date: string | undefined,
  creds: TenantCredentials,
): Promise<DormitoryAttendance[]> {
  const suffix = date ? `?date=${date}` : "";
  return apiRequest(`/boarding/students/${studentId}/attendance${suffix}`, { ...creds });
}

export function recordDormitoryAttendance(
  studentId: string,
  input: { date: string; status: DormitoryAttendanceStatus },
  creds: TenantCredentials,
): Promise<DormitoryAttendance> {
  return apiRequest(`/boarding/students/${studentId}/attendance`, { method: "POST", body: input, ...creds });
}
