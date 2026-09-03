import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface TenantUserSummary {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  membershipStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  roleCodes: string[];
}

export interface InviteTenantUserInput {
  email: string;
  roleCode: string;
  firstName?: string;
  lastName?: string;
}

export function listTenantUsers(creds: TenantCredentials): Promise<TenantUserSummary[]> {
  return apiRequest("/tenant-users", { ...creds });
}

export function inviteTenantUser(
  input: InviteTenantUserInput,
  creds: TenantCredentials,
): Promise<TenantUserSummary> {
  return apiRequest("/tenant-users", { method: "POST", body: input, ...creds });
}

export function grantRole(userId: string, roleCode: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/tenant-users/${userId}/roles`, { method: "POST", body: { roleCode }, ...creds });
}

export function revokeRole(userId: string, roleCode: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/tenant-users/${userId}/roles/${roleCode}`, { method: "DELETE", ...creds });
}

export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

export function updateMembershipStatus(
  userId: string,
  status: MembershipStatus,
  creds: TenantCredentials,
): Promise<void> {
  return apiRequest(`/tenant-users/${userId}/status`, { method: "PATCH", body: { status }, ...creds });
}

// §17 : pas d'endpoint pour lister les rôles tenant disponibles (donnée de
// référence, seedée une fois, jamais éditable par un tenant) — reflète
// TENANT_ROLES (prisma/seed/data/roles-permissions.ts) plutôt que d'ajouter une
// route juste pour ça.
export const TENANT_ROLES: { code: string; nameFr: string }[] = [
  { code: "SCHOOL_OWNER", nameFr: "Propriétaire établissement" },
  { code: "SCHOOL_ADMIN", nameFr: "Administrateur établissement" },
  { code: "DIRECTOR", nameFr: "Directeur" },
  { code: "ACADEMIC_DIRECTOR", nameFr: "Directeur académique" },
  { code: "SECRETARY", nameFr: "Secrétaire" },
  { code: "ACCOUNTANT", nameFr: "Comptable" },
  { code: "HR_MANAGER", nameFr: "Responsable RH" },
  { code: "TEACHER", nameFr: "Enseignant" },
  { code: "SUPERVISOR", nameFr: "Surveillant" },
  { code: "LIBRARIAN", nameFr: "Bibliothécaire" },
  { code: "TRANSPORT_MANAGER", nameFr: "Responsable transport" },
  { code: "CAFETERIA_MANAGER", nameFr: "Responsable cantine" },
  { code: "BOARDING_MANAGER", nameFr: "Responsable internat" },
  { code: "TENANT_AUDITOR", nameFr: "Auditeur établissement" },
];
