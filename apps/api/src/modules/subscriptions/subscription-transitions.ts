import type { BillingPeriod, SubscriptionStatus } from "@prisma/client";

/**
 * Allowed status transitions (§6). Anything not listed here is rejected —
 * a subscription can never jump, say, DRAFT -> ACTIVE without going through
 * PENDING_PAYMENT, and CANCELLED/REFUNDED are terminal (a new subscription is
 * created instead of reviving one).
 *
 * ACTIVE -> GRACE_PERIOD (direct) : ajouté pour l'avancement automatique dans le
 * temps (voir advanceSubscriptionIfDue ci-dessous) — une fin de période payée va
 * directement en grâce plutôt que de transiter artificiellement par PAST_DUE avec
 * une durée nulle. PAST_DUE reste atteignable séparément (ex. échec de paiement
 * signalé par un webhook), simplement pas comme étape obligée du chemin temporel.
 */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "TRIAL", "CANCELLED"],
  PENDING_PAYMENT: ["ACTIVE", "PENDING_ACTIVATION", "CANCELLED"],
  PENDING_ACTIVATION: ["ACTIVE", "CANCELLED"],
  TRIAL: ["ACTIVE", "EXPIRED", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED", "REFUNDED"],
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

/**
 * §6 : durée d'une période de facturation, utilisée pour calculer
 * `Subscription.currentPeriodEndsAt` à chaque entrée en ACTIVE. `CUSTOM` n'a pas
 * de durée connue (aucun champ ne porte sa longueur réelle aujourd'hui) — un
 * abonnement `CUSTOM` n'expire donc jamais automatiquement, limite assumée.
 * `SCHOOL_YEAR` est approximé à 12 mois calendaires plutôt qu'aligné sur
 * `AcademicYear.endDate` du tenant — un abonnement n'est pas toujours porté par
 * un tenant (parent/élève), et l'alignement exact resterait à faire pour ce cas.
 */
const BILLING_PERIOD_MONTHS: Partial<Record<BillingPeriod, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  SCHOOL_YEAR: 12,
};

// setMonth/setDate operate on the server's local wall-clock time — across a
// daylight-saving transition, the resulting instant drifts by an hour from what
// adding N months/days to a UTC timestamp should give. Using the UTC variants
// keeps the arithmetic tied to the calendar date/time actually stored (DateTime
// columns), regardless of the server process's local timezone.
export function computePeriodEnd(from: Date, billingPeriod: BillingPeriod): Date | null {
  const months = BILLING_PERIOD_MONTHS[billingPeriod];
  if (months === undefined) {
    return null;
  }
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function computeGraceEnd(from: Date, gracePeriodDays: number): Date | null {
  if (gracePeriodDays <= 0) {
    return null;
  }
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + gracePeriodDays);
  return result;
}
