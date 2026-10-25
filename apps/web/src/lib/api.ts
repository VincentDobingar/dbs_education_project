import { API_URL, ApiError, apiRequest, apiUpload } from "./apiClient.js";

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

/** Espace d'où part la demande : décide de la page de connexion proposée ensuite. */
export type PasswordResetSpace = "staff" | "portal" | "admin";

export function requestPasswordReset(
  email: string,
  space: PasswordResetSpace,
  locale: "fr" | "en",
): Promise<{ message: string }> {
  return apiRequest("/auth/forgot-password", { method: "POST", body: { email, space, locale } });
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return apiRequest("/auth/reset-password", { method: "POST", body: { token, password } });
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// §34 : pour un compte détenant un rôle sensible, POST /auth/login ne renvoie pas
// de session mais un défi MFA (MFA déjà actif) ou une obligation d'inscription MFA
// (MFA pas encore configuré) — voir LoginResult côté API (auth.service.ts).
export interface MfaChallengeResult {
  mfaRequired: true;
  challengeToken: string;
}

export interface MfaEnrollmentResult {
  mfaEnrollmentRequired: true;
  enrollmentToken: string;
}

export type MfaPending = MfaChallengeResult | MfaEnrollmentResult;
export type LoginResult = AuthTokens | MfaPending;

export function isAuthTokens(result: LoginResult): result is AuthTokens {
  return "accessToken" in result;
}

export function loginStart(email: string, password: string): Promise<LoginResult> {
  return apiRequest("/auth/login", { method: "POST", body: { email, password } });
}

/**
 * Pour les écrans qui ne gèrent pas (encore) le second facteur : échoue
 * explicitement avec MFA_REQUIRED plutôt que de laisser l'appelant utiliser un
 * objet sans accessToken (ce qui produisait un 401 opaque sur /auth/me).
 */
export async function login(email: string, password: string): Promise<AuthTokens> {
  const result = await loginStart(email, password);
  if (isAuthTokens(result)) return result;
  throw new ApiError(403, "MFA_REQUIRED", "A second authentication factor is required");
}

export function verifyMfaChallenge(challengeToken: string, code: string): Promise<AuthTokens> {
  return apiRequest("/auth/mfa/verify", { method: "POST", body: { challengeToken, code } });
}

// Appels faits avec le jeton d'inscription MFA (pas un jeton d'accès) : fetch direct
// plutôt qu'apiRequest, dont la logique de rafraîchissement sur 401 viderait la
// session « staff » et redirigerait vers /connexion — sans rapport ici.
async function mfaEnrollmentRequest<T>(path: string, enrollmentToken: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${enrollmentToken}` },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = data as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      errorBody?.code ?? "UNKNOWN_ERROR",
      errorBody?.message ?? "Request failed",
    );
  }
  return data as T;
}

export interface MfaSetupResult {
  secret: string;
  otpauthUri: string;
}

export function setupMfaWithEnrollmentToken(enrollmentToken: string): Promise<MfaSetupResult> {
  return mfaEnrollmentRequest("/auth/mfa/setup", enrollmentToken, {});
}

export function enableMfaWithEnrollmentToken(
  enrollmentToken: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  return mfaEnrollmentRequest("/auth/mfa/enable", enrollmentToken, { code });
}

export interface OnboardTenantInput {
  name: string;
  ownershipType: "PUBLIC" | "PRIVATE";
  countryIsoCode: string;
  currencyIsoCode: string;
  subdomain: string;
  city?: string;
  logoUrl?: string;
  planCode?: string;
  billingPeriod?: string;
  promoCode?: string;
}

export interface OnboardTenantResult {
  tenant: { id: string; name: string; status: string; logoUrl: string | null };
  subdomain: string;
  subscription: { id: string; status: string } | null;
}

export function onboardTenant(input: OnboardTenantInput, accessToken: string): Promise<OnboardTenantResult> {
  return apiRequest("/tenants/onboarding", { method: "POST", body: input, accessToken });
}

// Assistant d'inscription (SignupPage.tsx) : le fichier est choisi à l'étape
// "établissement", mais aucun tenant n'existe encore pour le rattacher — appelé
// juste après login(), juste avant onboardTenant(), avec l'URL renvoyée passée
// en `logoUrl` de ce dernier.
export function uploadTenantLogoAtSignup(file: File, accessToken: string): Promise<{ url: string }> {
  return apiUpload("/tenants/logo-upload", "logo", file, { accessToken });
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
  platformRoleCodes: string[];
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
