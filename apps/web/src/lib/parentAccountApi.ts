import { apiRequest } from "./apiClient.js";

export interface ParentProfile {
  photoUrl?: string | null;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  schools?: { id: string; name: string }[];
}
export interface CoverageOption {
  studentId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  covered: boolean;
}
export interface ParentPlan {
  code: string;
  nameFr: string;
  childrenCovered: number | null;
}
export interface ParentSubscription {
  id: string;
  status: string;
  currentPeriodEndsAt: string | null;
  plan: ParentPlan;
  parentCoverages: { studentId: string; tenantId: string; releasedAt: string | null }[];
  invoices: { id: string; number: string; totalCents: number; status: string }[];
}
export const getParentProfile = (accessToken: string): Promise<ParentProfile> =>
  apiRequest("/parent-portal/profile", { accessToken, authContext: "portal" });
export const updateParentProfile = (
  input: { firstName: string; lastName: string; address: string | null },
  accessToken: string,
): Promise<ParentProfile> =>
  apiRequest("/parent-portal/profile", { accessToken, authContext: "portal", method: "PATCH", body: input });
export const requestParentContactChange = (
  input: { channel: "EMAIL" | "PHONE"; value: string; password: string },
  accessToken: string,
): Promise<{ id: string; expiresAt: string }> =>
  apiRequest("/parent-portal/profile/contact-changes", {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: input,
  });
export const confirmParentContactChange = (
  id: string,
  code: string,
  accessToken: string,
): Promise<ParentProfile> =>
  apiRequest(`/parent-portal/profile/contact-changes/${id}/confirm`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: { code },
  });
export const getCoverageOptions = (accessToken: string): Promise<CoverageOption[]> =>
  apiRequest("/parent-portal/coverage-options", { accessToken, authContext: "portal" });
export const getParentPlans = (accessToken: string): Promise<ParentPlan[]> =>
  apiRequest("/parent-portal/plans", { accessToken, authContext: "portal" });
export const getParentSubscriptions = (accessToken: string): Promise<ParentSubscription[]> =>
  apiRequest("/parent-portal/subscriptions", { accessToken, authContext: "portal" });
export const subscribeParent = (
  input: {
    planCode: string;
    billingPeriod: string;
    promoCode?: string;
    children: { studentId: string; tenantId: string }[];
  },
  accessToken: string,
): Promise<{ id: string }> =>
  apiRequest("/parent-portal/subscriptions", {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: input,
  });
export const attachParentChildren = (
  id: string,
  children: { studentId: string; tenantId: string }[],
  accessToken: string,
): Promise<unknown> =>
  apiRequest(`/parent-portal/subscriptions/${id}/coverage`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: { children },
  });
export const cancelParentSubscription = (id: string, accessToken: string): Promise<unknown> =>
  apiRequest(`/parent-portal/subscriptions/${id}/cancel`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: { reason: "Annulation par le parent" },
  });
export const invoiceParentSubscription = (
  id: string,
  input: { currencyIsoCode: string; billingName: string; billingEmail: string },
  accessToken: string,
): Promise<{ id: string; number: string }> =>
  apiRequest(`/parent-portal/subscriptions/${id}/invoice`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: input,
  });
export const prepareParentPayment = (
  id: string,
  invoiceId: string,
  accessToken: string,
): Promise<{ id: string }> =>
  apiRequest(`/parent-portal/subscriptions/${id}/payment-intent`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: { invoiceId, providerCode: "CASH_AGENT", idempotencyKey: `parent:${id}:${invoiceId}` },
  });
