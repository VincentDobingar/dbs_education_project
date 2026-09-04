import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type BeneficiaryCategory = "PARENT" | "STUDENT";

export interface ActivationInvitation {
  id: string;
  studentId: string;
  beneficiaryCategory: BeneficiaryCategory;
  invitedEmail: string | null;
  invitedPhone: string | null;
  status: "PENDING" | "SENT" | "USED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
}

export interface CreateInvitationInput {
  studentId: string;
  beneficiaryCategory: BeneficiaryCategory;
  invitedEmail?: string;
  invitedPhone?: string;
}

export interface CreatedInvitation {
  invitation: ActivationInvitation;
  code: string;
}

// Staff-side (tenant): manage invitations and existing relationships for a student.
export function createInvitation(
  input: CreateInvitationInput,
  creds: TenantCredentials,
): Promise<CreatedInvitation> {
  return apiRequest("/family/invitations", { method: "POST", body: input, ...creds });
}

export function listInvitations(
  creds: TenantCredentials,
  studentId?: string,
): Promise<ActivationInvitation[]> {
  const suffix = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return apiRequest(`/family/invitations${suffix}`, { ...creds });
}

export function revokeInvitation(id: string, creds: TenantCredentials): Promise<ActivationInvitation> {
  return apiRequest(`/family/invitations/${id}/revoke`, { method: "POST", ...creds });
}

export interface ParentStudentRelationship {
  id: string;
  parentUserId: string;
  studentId: string;
  status: "PENDING" | "VERIFIED" | "REVOKED";
  verifiedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

export function listRelationships(
  creds: TenantCredentials,
  studentId?: string,
): Promise<ParentStudentRelationship[]> {
  const suffix = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return apiRequest(`/family/relationships${suffix}`, { ...creds });
}

export function revokeRelationship(
  id: string,
  reason: string,
  creds: TenantCredentials,
): Promise<ParentStudentRelationship> {
  return apiRequest(`/family/relationships/${id}/revoke`, { method: "POST", body: { reason }, ...creds });
}

// Beneficiary-side (parent/student, no tenant): redeem a code, list children/links,
// manage a family account. Only an accessToken is needed — never a subdomain.
export interface RedeemedActivation {
  beneficiaryCategory: BeneficiaryCategory;
  relationship?: ParentStudentRelationship;
  studentLink?: { id: string; studentId: string; userId: string };
}

export function redeemActivation(code: string, accessToken: string): Promise<RedeemedActivation> {
  return apiRequest("/family/activation/redeem", { method: "POST", body: { code }, accessToken });
}

export interface FamilyChildStudent {
  id: string;
  tenantId: string;
  matricule: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface FamilyChild {
  relationship: ParentStudentRelationship;
  student: FamilyChildStudent;
}

export function listMyChildren(accessToken: string): Promise<FamilyChild[]> {
  return apiRequest("/family/children", { accessToken });
}

export interface LinkedStudent {
  link: { id: string; studentId: string; userId: string };
  student: FamilyChildStudent;
}

export function listLinkedStudents(accessToken: string): Promise<LinkedStudent[]> {
  return apiRequest("/family/linked-students", { accessToken });
}

export interface FamilyAccount {
  id: string;
  primaryUserId: string;
  maxChildren: number | null;
}

export function getFamilyAccount(accessToken: string): Promise<FamilyAccount> {
  return apiRequest("/family/family-account", { accessToken });
}

export function createFamilyAccount(
  maxChildren: number | undefined,
  accessToken: string,
): Promise<FamilyAccount> {
  return apiRequest("/family/family-account", {
    method: "POST",
    body: maxChildren ? { maxChildren } : {},
    accessToken,
  });
}
