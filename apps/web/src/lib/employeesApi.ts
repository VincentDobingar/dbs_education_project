import { apiRequest, type TenantCredentials } from "./apiClient.js";

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
