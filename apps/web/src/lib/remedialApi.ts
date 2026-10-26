import { apiRequest, type TenantCredentials } from "./apiClient.js";

/** Cours de renforcement entre établissements — voir apps/api/src/modules/remedial. */

export type RemedialMode = "ONSITE" | "ONLINE" | "HYBRID";
export type RemedialFormat = "INDIVIDUAL" | "GROUP";
export type RemedialOfferStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "CLOSED";
export type RemedialEnrollmentStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface MoneyCurrency {
  isoCode: string;
  symbol: string;
  decimalDigits: number;
}

export interface RemedialTariff {
  id: string;
  label: string;
  format: RemedialFormat;
  mode: RemedialMode;
  hourlyRateCents: number;
  schoolShareBps: number;
  isActive: boolean;
}

export interface TariffInput {
  label: string;
  format: RemedialFormat;
  mode: RemedialMode;
  hourlyRateCents: number;
  schoolShareBps: number;
  isActive: boolean;
}

export interface RemedialOffer {
  id: string;
  tariffId: string;
  subjectLabel: string;
  levelLabel: string;
  title: string;
  description: string;
  mode: RemedialMode;
  format: RemedialFormat;
  location: string | null;
  accessDetails: string | null;
  capacity: number;
  totalMinutes: number;
  startsOn: string;
  endsOn: string;
  scheduleNote: string;
  priceCents: number;
  schoolShareBps: number;
  platformShareBps: number;
  status: RemedialOfferStatus;
  reviewNote: string | null;
  teacherName: string;
  tariff: { label: string };
  enrollments: { confirmed: number; pending: number };
}

export interface OfferInput {
  tariffId: string;
  subjectLabel: string;
  levelLabel: string;
  title: string;
  description: string;
  location?: string;
  accessDetails?: string;
  capacity: number;
  totalMinutes: number;
  startsOn: string;
  endsOn: string;
  scheduleNote: string;
}

export interface OfferEnrollment {
  id: string;
  reference: string;
  status: RemedialEnrollmentStatus;
  amountCents: number;
  createdAt: string;
  confirmedAt: string | null;
  enrolledAs: "PARENT" | "STUDENT";
  student: { firstName: string; lastName: string };
  learnerSchool: string;
  contactEmail: string | null;
}

export interface PayoutLine {
  id: string;
  beneficiary: "TEACHER" | "SCHOOL" | "PLATFORM";
  amountCents: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  paidAt: string | null;
  paidReference: string | null;
  createdAt: string;
  reference: string;
  offerTitle: string;
}

// ---------------------------------------------------------------- Établissement

export const listTariffs = (creds: TenantCredentials): Promise<RemedialTariff[]> =>
  apiRequest("/remedial/tariffs", { ...creds });
export const createTariff = (input: TariffInput, creds: TenantCredentials): Promise<RemedialTariff> =>
  apiRequest("/remedial/tariffs", { method: "POST", body: input, ...creds });
export const updateTariff = (
  id: string,
  input: TariffInput,
  creds: TenantCredentials,
): Promise<RemedialTariff> => apiRequest(`/remedial/tariffs/${id}`, { method: "PUT", body: input, ...creds });

export const listOffers = (scope: "mine" | "school", creds: TenantCredentials): Promise<RemedialOffer[]> =>
  apiRequest(`/remedial/offers?scope=${scope}`, { ...creds });
export const createOffer = (input: OfferInput, creds: TenantCredentials): Promise<RemedialOffer> =>
  apiRequest("/remedial/offers", { method: "POST", body: input, ...creds });
export const updateOffer = (
  id: string,
  input: OfferInput,
  creds: TenantCredentials,
): Promise<RemedialOffer> => apiRequest(`/remedial/offers/${id}`, { method: "PUT", body: input, ...creds });
export const submitOffer = (id: string, creds: TenantCredentials): Promise<RemedialOffer> =>
  apiRequest(`/remedial/offers/${id}/submit`, { method: "POST", ...creds });
export const reviewOffer = (
  id: string,
  decision: "APPROVE" | "REJECT",
  note: string,
  creds: TenantCredentials,
): Promise<RemedialOffer> =>
  apiRequest(`/remedial/offers/${id}/review`, {
    method: "POST",
    body: { decision, ...(note ? { note } : {}) },
    ...creds,
  });
export const closeOffer = (id: string, creds: TenantCredentials): Promise<RemedialOffer> =>
  apiRequest(`/remedial/offers/${id}/close`, { method: "POST", ...creds });
export const listOfferEnrollments = (id: string, creds: TenantCredentials): Promise<OfferEnrollment[]> =>
  apiRequest(`/remedial/offers/${id}/enrollments`, { ...creds });
export const recordCashPayment = (enrollmentId: string, creds: TenantCredentials): Promise<unknown> =>
  apiRequest(`/remedial/enrollments/${enrollmentId}/cash-payment`, { method: "POST", ...creds });
export const listSchoolPayouts = (creds: TenantCredentials): Promise<PayoutLine[]> =>
  apiRequest("/remedial/payouts", { ...creds });

// ---------------------------------------------------------------- Catalogue et famille

export interface CatalogOffer {
  id: string;
  title: string;
  description: string;
  subjectLabel: string;
  levelLabel: string;
  mode: RemedialMode;
  format: RemedialFormat;
  location: string | null;
  scheduleNote: string;
  startsOn: string;
  endsOn: string;
  totalMinutes: number;
  priceCents: number;
  currency: MoneyCurrency | null;
  capacity: number;
  seatsLeft: number;
  teacher: string;
  school: {
    name: string;
    city: string | null;
    countryIsoCode: string;
    countryNameFr: string;
    countryNameEn: string;
  };
}

export interface Learner {
  studentId: string;
  firstName: string;
  lastName: string;
  schoolName: string;
  enrolledAs: "PARENT" | "STUDENT";
}

export interface MyEnrollment {
  id: string;
  reference: string;
  status: RemedialEnrollmentStatus;
  amountCents: number;
  currency: MoneyCurrency | null;
  studentName: string;
  createdAt: string;
  confirmedAt: string | null;
  offer: {
    id: string;
    title: string;
    subjectLabel: string;
    mode: RemedialMode;
    scheduleNote: string;
    startsOn: string;
    endsOn: string;
    location: string | null;
    accessDetails: string | null;
    teacher: string;
    schoolName: string;
    schoolCity: string | null;
  };
}

export interface PaymentOptions {
  providers: { code: string; nameFr: string; nameEn: string; isTestMode: boolean }[];
  cash: { schoolName: string; reference: string };
}

export function listCatalog(
  query: { country?: string; mode?: RemedialMode; q?: string } = {},
): Promise<CatalogOffer[]> {
  const params = new URLSearchParams();
  if (query.country) params.set("country", query.country);
  if (query.mode) params.set("mode", query.mode);
  if (query.q) params.set("q", query.q);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/remedial-portal/catalog${suffix}`);
}

export const listLearners = (accessToken: string): Promise<Learner[]> =>
  apiRequest("/remedial-portal/learners", { accessToken });
export const listMyEnrollments = (accessToken: string): Promise<MyEnrollment[]> =>
  apiRequest("/remedial-portal/enrollments", { accessToken });
export const enroll = (offerId: string, studentId: string, accessToken: string): Promise<{ id: string }> =>
  apiRequest("/remedial-portal/enrollments", { method: "POST", body: { offerId, studentId }, accessToken });
export const cancelEnrollment = (id: string, accessToken: string): Promise<unknown> =>
  apiRequest(`/remedial-portal/enrollments/${id}/cancel`, { method: "POST", accessToken });
export const getPaymentOptions = (id: string, accessToken: string): Promise<PaymentOptions> =>
  apiRequest(`/remedial-portal/enrollments/${id}/payment-options`, { accessToken });
export const payOnline = (
  id: string,
  providerCode: string,
  phone: string,
  accessToken: string,
): Promise<{ paymentIntentId: string; status: "PENDING"; customerMessage: string | null }> =>
  apiRequest(`/remedial-portal/enrollments/${id}/pay`, {
    method: "POST",
    body: { providerCode, phone },
    accessToken,
  });
export const getPaymentStatus = (
  id: string,
  paymentIntentId: string,
  accessToken: string,
): Promise<{ paymentStatus: string; enrollmentStatus: RemedialEnrollmentStatus }> =>
  apiRequest(`/remedial-portal/enrollments/${id}/payments/${paymentIntentId}`, { accessToken });

// ---------------------------------------------------------------- Super-administration

export interface PlatformPayoutLine extends PayoutLine {
  schoolName: string;
  currency: MoneyCurrency | null;
}

export const listPlatformPayouts = (
  status: "PENDING" | "PAID" | "",
  accessToken: string,
): Promise<PlatformPayoutLine[]> =>
  apiRequest(`/platform/remedial/payouts${status ? `?status=${status}` : ""}`, {
    accessToken,
    authContext: "admin",
  });
export const markPayoutPaid = (
  id: string,
  reference: string,
  justification: string,
  accessToken: string,
): Promise<unknown> =>
  apiRequest(`/platform/remedial/payouts/${id}/mark-paid`, {
    method: "POST",
    body: { reference, justification },
    accessToken,
    authContext: "admin",
  });

/** « 15 000 FCFA » à partir d'unités mineures — même règle que lib/publicApi.formatMoney. */
export function formatAmount(
  amountCents: number,
  currency: MoneyCurrency | null | undefined,
  locale: string,
): string {
  if (!currency) return String(amountCents);
  const amount = amountCents / 10 ** currency.decimalDigits;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: currency.decimalDigits }).format(amount)} ${currency.symbol}`;
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;
}

export interface RemedialContext {
  currency: MoneyCurrency;
  platformShareBps: number;
  canManage: boolean;
  canTeach: boolean;
  hasEmployeeRecord: boolean;
}

export const getRemedialContext = (creds: TenantCredentials): Promise<RemedialContext> =>
  apiRequest("/remedial/context", { ...creds });
