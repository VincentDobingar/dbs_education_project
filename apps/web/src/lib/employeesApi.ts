import { apiRequest, fetchBlob, type TenantCredentials } from "./apiClient.js";

export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "TERMINATED";

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  hireDate: string | null;
  status: EmployeeStatus;
  deletedAt: string | null;
}

export interface CreateEmployeeInput {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
}

export function listEmployees(creds: TenantCredentials): Promise<Employee[]> {
  return apiRequest("/employees", { ...creds });
}

export function createEmployee(input: CreateEmployeeInput, creds: TenantCredentials): Promise<Employee> {
  return apiRequest("/employees", { method: "POST", body: input, ...creds });
}

export function getEmployee(id: string, creds: TenantCredentials): Promise<Employee> {
  return apiRequest(`/employees/${id}`, { ...creds });
}

export function updateEmployeeStatus(
  id: string,
  status: EmployeeStatus,
  creds: TenantCredentials,
): Promise<Employee> {
  return apiRequest(`/employees/${id}`, { method: "PATCH", body: { status }, ...creds });
}

export function archiveEmployee(id: string, creds: TenantCredentials): Promise<Employee> {
  return apiRequest(`/employees/${id}/archive`, { method: "POST", ...creds });
}

// §27 : RH avancé — contrats, présences, congés, évaluations, documents, export de paie.

export interface EmploymentContract {
  id: string;
  employeeId: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  salaryCents: number | null;
  fileUrl: string | null;
}

export function listContracts(employeeId: string, creds: TenantCredentials): Promise<EmploymentContract[]> {
  return apiRequest(`/employees/${employeeId}/contracts`, { ...creds });
}

export function createContract(
  employeeId: string,
  input: {
    contractType: string;
    startDate: string;
    endDate?: string;
    salaryCents?: number;
    fileUrl?: string;
  },
  creds: TenantCredentials,
): Promise<EmploymentContract> {
  return apiRequest(`/employees/${employeeId}/contracts`, { method: "POST", body: input, ...creds });
}

export type EmployeeAttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

export interface StaffAttendance {
  id: string;
  employeeId: string;
  date: string;
  status: EmployeeAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export function listStaffAttendance(
  employeeId: string,
  query: { startDate?: string; endDate?: string },
  creds: TenantCredentials,
): Promise<StaffAttendance[]> {
  const params = new URLSearchParams();
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/employees/${employeeId}/attendance${suffix}`, { ...creds });
}

export function recordStaffAttendance(
  employeeId: string,
  input: { date: string; status: EmployeeAttendanceStatus },
  creds: TenantCredentials,
): Promise<StaffAttendance> {
  return apiRequest(`/employees/${employeeId}/attendance`, { method: "POST", body: input, ...creds });
}

export type LeaveType = "ANNUAL" | "SICK" | "MATERNITY" | "UNPAID" | "OTHER";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  reason: string | null;
  approvedByEmployeeId: string | null;
}

export function listLeaveRequests(employeeId: string, creds: TenantCredentials): Promise<LeaveRequest[]> {
  return apiRequest(`/employees/${employeeId}/leave-requests`, { ...creds });
}

export function createLeaveRequest(
  employeeId: string,
  input: { type: LeaveType; startDate: string; endDate: string; reason?: string },
  creds: TenantCredentials,
): Promise<LeaveRequest> {
  return apiRequest(`/employees/${employeeId}/leave-requests`, { method: "POST", body: input, ...creds });
}

export function decideLeaveRequest(
  employeeId: string,
  id: string,
  status: "APPROVED" | "REJECTED" | "CANCELLED",
  creds: TenantCredentials,
): Promise<LeaveRequest> {
  return apiRequest(`/employees/${employeeId}/leave-requests/${id}/decision`, {
    method: "PATCH",
    body: { status },
    ...creds,
  });
}

export interface PerformanceEvaluation {
  id: string;
  employeeId: string;
  evaluatedByEmployeeId: string | null;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  comments: string | null;
}

export function listPerformanceEvaluations(
  employeeId: string,
  creds: TenantCredentials,
): Promise<PerformanceEvaluation[]> {
  return apiRequest(`/employees/${employeeId}/evaluations`, { ...creds });
}

export function createPerformanceEvaluation(
  employeeId: string,
  input: { periodStart: string; periodEnd: string; score?: number; comments?: string },
  creds: TenantCredentials,
): Promise<PerformanceEvaluation> {
  return apiRequest(`/employees/${employeeId}/evaluations`, { method: "POST", body: input, ...creds });
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  category: string;
  fileUrl: string;
  uploadedByUserId: string | null;
}

export function listEmployeeDocuments(
  employeeId: string,
  creds: TenantCredentials,
): Promise<EmployeeDocument[]> {
  return apiRequest(`/employees/${employeeId}/documents`, { ...creds });
}

export function addEmployeeDocument(
  employeeId: string,
  input: { category: string; fileUrl: string },
  creds: TenantCredentials,
): Promise<EmployeeDocument> {
  return apiRequest(`/employees/${employeeId}/documents`, { method: "POST", body: input, ...creds });
}

export function removeEmployeeDocument(
  employeeId: string,
  id: string,
  creds: TenantCredentials,
): Promise<void> {
  return apiRequest(`/employees/${employeeId}/documents/${id}`, { method: "DELETE", ...creds });
}

export function fetchPayrollExportCsv(creds: TenantCredentials): Promise<Blob> {
  return fetchBlob("/employees/payroll/export.csv", creds);
}

export function fetchPayrollExportXlsx(creds: TenantCredentials): Promise<Blob> {
  return fetchBlob("/employees/payroll/export.xlsx", creds);
}
