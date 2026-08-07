import type { SubscriptionStatus } from "@prisma/client";

/**
 * Allowed status transitions (§6). Anything not listed here is rejected —
 * a subscription can never jump, say, DRAFT -> ACTIVE without going through
 * PENDING_PAYMENT, and CANCELLED/REFUNDED are terminal (a new subscription is
 * created instead of reviving one).
 */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "TRIAL", "CANCELLED"],
  PENDING_PAYMENT: ["ACTIVE", "PENDING_ACTIVATION", "CANCELLED"],
  PENDING_ACTIVATION: ["ACTIVE", "CANCELLED"],
  TRIAL: ["ACTIVE", "EXPIRED", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED", "REFUNDED"],
  PAST_DUE: ["ACTIVE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"],
  GRACE_PERIOD: ["ACTIVE", "SUSPENDED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  EXPIRED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses that grant access — the only ones requireActiveSubscription() accepts. */
export const ACTIVE_LIKE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "ACTIVE",
  "TRIAL",
  "GRACE_PERIOD",
]);

export function isTransitionAllowed(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED_SUBSCRIPTION_TRANSITIONS[from].includes(to);
}
