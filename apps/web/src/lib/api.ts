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
