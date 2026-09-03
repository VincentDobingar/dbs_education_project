import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type IncidentSeverity = "MINOR" | "MODERATE" | "SEVERE";

export interface DisciplinaryIncident {
  id: string;
  studentId: string;
  occurredAt: string;
  description: string;
  severity: IncidentSeverity;
  sanction: string | null;
  correctiveAction: string | null;
}

export interface CreateIncidentInput {
  studentId: string;
  occurredAt: string;
  description: string;
  severity: IncidentSeverity;
  sanction?: string;
  correctiveAction?: string;
}

export function listIncidents(creds: TenantCredentials, studentId?: string): Promise<DisciplinaryIncident[]> {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return apiRequest(`/discipline/incidents${query}`, { ...creds });
}

export function createIncident(
  input: CreateIncidentInput,
  creds: TenantCredentials,
): Promise<DisciplinaryIncident> {
  return apiRequest("/discipline/incidents", { method: "POST", body: input, ...creds });
}

export function removeIncident(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/discipline/incidents/${id}`, { method: "DELETE", ...creds });
}
