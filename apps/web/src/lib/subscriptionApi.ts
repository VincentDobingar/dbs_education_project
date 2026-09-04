import { apiRequest, ApiError } from "./apiClient.js";
import type { Subscription } from "./parentPortalApi.js";

export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | "SCHOOL_YEAR" | "CUSTOM";

export interface CreateSubscriptionInput {
  planCode: string;
  billingPeriod: BillingPeriod;
  promoCode?: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export interface PaymentIntent {
  id: string;
  status: string;
  amountCents: number;
}

async function fetchOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 402)) {
      return null;
    }
    throw error;
  }
}

// §9 : family subscription (self-service, no tenant) — one subscription covers every
// verified child, capped by FamilyAccount.maxChildren.
export function createFamilySubscription(
  input: CreateSubscriptionInput,
  accessToken: string,
): Promise<Subscription> {
  return apiRequest("/subscriptions/family", { method: "POST", body: input, accessToken });
}

export function getFamilySubscription(accessToken: string): Promise<Subscription | null> {
  return fetchOrNull(() => apiRequest("/subscriptions/family", { accessToken }));
}

export function createFamilyInvoice(
  input: { currencyIsoCode: string; countryIsoCode?: string; billingName: string; billingEmail: string },
  accessToken: string,
): Promise<Invoice> {
  return apiRequest("/subscriptions/family/invoice", { method: "POST", body: input, accessToken });
}

export function createFamilyPaymentIntent(invoiceId: string, accessToken: string): Promise<PaymentIntent> {
  return apiRequest("/subscriptions/family/payment-intent", {
    method: "POST",
    body: { invoiceId, providerCode: "CASH_AGENT" },
    accessToken,
  });
}

export function recordFamilyCashPayment(paymentIntentId: string, accessToken: string): Promise<unknown> {
  return apiRequest("/subscriptions/family/cash-payment", {
    method: "POST",
    body: { paymentIntentId },
    accessToken,
  });
}

// §26 : student subscription (self-service, no tenant) — single-seat, own to that student.
export function createStudentSubscription(
  studentId: string,
  input: CreateSubscriptionInput,
  accessToken: string,
): Promise<Subscription> {
  return apiRequest(`/subscriptions/student/${studentId}`, { method: "POST", body: input, accessToken });
}

export function getStudentSubscription(studentId: string, accessToken: string): Promise<Subscription | null> {
  return fetchOrNull(() => apiRequest(`/subscriptions/student/${studentId}`, { accessToken }));
}

export function createStudentInvoice(
  studentId: string,
  input: { currencyIsoCode: string; countryIsoCode?: string; billingName: string; billingEmail: string },
  accessToken: string,
): Promise<Invoice> {
  return apiRequest(`/subscriptions/student/${studentId}/invoice`, {
    method: "POST",
    body: input,
    accessToken,
  });
}

export function createStudentPaymentIntent(
  studentId: string,
  invoiceId: string,
  accessToken: string,
): Promise<PaymentIntent> {
  return apiRequest(`/subscriptions/student/${studentId}/payment-intent`, {
    method: "POST",
    body: { invoiceId, providerCode: "CASH_AGENT" },
    accessToken,
  });
}

export function recordStudentCashPayment(
  studentId: string,
  paymentIntentId: string,
  accessToken: string,
): Promise<unknown> {
  return apiRequest(`/subscriptions/student/${studentId}/cash-payment`, {
    method: "POST",
    body: { paymentIntentId },
    accessToken,
  });
}
