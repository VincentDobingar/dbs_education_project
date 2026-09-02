import { apiRequest } from "./apiClient.js";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterResult {
  id: string;
  email: string;
  status: string;
  // §34 : aucun fournisseur email réel par défaut — le jeton est renvoyé ici pour
  // que l'appelant puisse le consommer immédiatement (ex. l'assistant d'inscription
  // établissement), plutôt que de rester bloqué en attente d'un email jamais envoyé.
  emailVerificationToken: string;
}

export function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  return apiRequest("/auth/register", { method: "POST", body: input });
}

export function verifyEmail(token: string): Promise<{ id: string; status: string }> {
  return apiRequest("/auth/verify-email", { method: "POST", body: { token } });
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function login(email: string, password: string): Promise<AuthTokens> {
  return apiRequest("/auth/login", { method: "POST", body: { email, password } });
}

export interface OnboardTenantInput {
  name: string;
  ownershipType: "PUBLIC" | "PRIVATE";
  countryIsoCode: string;
  currencyIsoCode: string;
  subdomain: string;
  city?: string;
  planCode?: string;
  billingPeriod?: string;
  promoCode?: string;
}

export interface OnboardTenantResult {
  tenant: { id: string; name: string; status: string };
  subdomain: string;
  subscription: { id: string; status: string } | null;
}

export function onboardTenant(input: OnboardTenantInput, accessToken: string): Promise<OnboardTenantResult> {
  return apiRequest("/tenants/onboarding", { method: "POST", body: input, accessToken });
}

export interface CurrentUserTenantMembership {
  tenantId: string;
  tenantName: string;
  subdomain: string;
  roleCodes: string[];
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  tenantMemberships: CurrentUserTenantMembership[];
}

export function getCurrentUser(accessToken: string): Promise<CurrentUserProfile> {
  return apiRequest("/auth/me", { accessToken });
}

export interface DirectionDashboard {
  windowDays: number;
  students: {
    total: number;
    byStatus: Record<string, number>;
    byGender: { gender: string; count: number }[];
    byClassroom: { classroomId: string; classroomName: string; count: number }[];
    recentEnrollments: number;
  };
  staff: {
    total: number;
    byStatus: Record<string, number>;
  };
  attendance: {
    presentCount: number;
    totalCount: number;
    presenceRate: number | null;
  };
  academics: {
    reportCardCount: number;
    averageScore: number | null;
  };
  finance: {
    totalInvoicedCents: number;
    totalPaidCents: number;
    outstandingCents: number;
    overdueInvoiceCount: number;
    overdueCents: number;
    recentRevenueCents: number;
    recentExpensesCents: number;
  };
  discipline: {
    recentIncidentCount: number;
  };
}

export function getDirectionDashboard(accessToken: string, subdomain: string): Promise<DirectionDashboard> {
  return apiRequest("/dashboard/direction", { accessToken, subdomain });
}
