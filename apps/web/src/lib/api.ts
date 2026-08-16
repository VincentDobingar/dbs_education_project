import { apiRequest } from "./apiClient.js";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export function registerAccount(input: RegisterInput): Promise<{ id: string; email: string }> {
  return apiRequest("/auth/register", { method: "POST", body: input });
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
