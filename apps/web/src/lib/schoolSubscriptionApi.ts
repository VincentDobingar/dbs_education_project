import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type SubscriptionStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PENDING_ACTIVATION"
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

/** Statuts qui ouvrent l'accès aux modules (requireActiveSubscription côté API). */
export const ACCESS_GRANTING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "ACTIVE",
  "TRIAL",
  "GRACE_PERIOD",
]);

/** Statuts après lesquels l'établissement peut souscrire à nouveau. */
export const ENDED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["CANCELLED", "EXPIRED", "REFUNDED"]);

/** Statuts encore modifiables par l'établissement (annulation pour changer de formule). */
export const CANCELLABLE_BY_SCHOOL_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "DRAFT",
  "PENDING_PAYMENT",
]);

export const SCHOOL_PLAN_CODES = ["SCHOOL_ESSENTIAL", "SCHOOL_PROFESSIONAL", "SCHOOL_PREMIUM"] as const;
export type SchoolPlanCode = (typeof SCHOOL_PLAN_CODES)[number];

export interface SchoolSubscription {
  id: string;
  status: SubscriptionStatus;
  billingPeriod: string;
  createdAt: string;
  startsAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  graceEndsAt: string | null;
  plan: { code: string; nameFr: string; nameEn: string; trialDays: number } | null;
}

/** `null` quand l'établissement n'a encore aucun abonnement (404 NO_SUBSCRIPTION). */
export async function getSchoolSubscription(creds: TenantCredentials): Promise<SchoolSubscription | null> {
  try {
    return await apiRequest<SchoolSubscription>("/subscriptions/school", { ...creds });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "NO_SUBSCRIPTION") {
      return null;
    }
    throw error;
  }
}

export function createSchoolSubscription(
  input: { planCode: SchoolPlanCode; promoCode?: string },
  creds: TenantCredentials,
): Promise<{ id: string; status: SubscriptionStatus }> {
  // Seuls des prix mensuels sont définis pour l'instant (prisma/seed/data/plan-prices.ts).
  return apiRequest("/subscriptions/school", {
    method: "POST",
    body: {
      planCode: input.planCode,
      billingPeriod: "MONTHLY",
      ...(input.promoCode ? { promoCode: input.promoCode } : {}),
    },
    ...creds,
  });
}

export function cancelSchoolSubscription(
  id: string,
  creds: TenantCredentials,
): Promise<{ id: string; status: SubscriptionStatus }> {
  return apiRequest(`/subscriptions/school/${id}/cancel`, { method: "POST", body: {}, ...creds });
}
