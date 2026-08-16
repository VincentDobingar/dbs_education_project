import type { SubscriberCategory, SubscriptionStatus, TenantStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

import type { StatsOverviewQuery } from "./stats-admin.validation.js";

const DEFAULT_WINDOW_DAYS = 30;
const RENEWAL_LOOKAHEAD_DAYS = 30;

/**
 * §18 (tableau de bord super-admin) et §32 (indicateurs commerciaux) : snapshot
 * en lecture seule, jamais un écrivain — aucun recordAuditLog ici, consulter des
 * statistiques n'est pas une intervention dans un tenant au sens de §31.
 *
 * Volontairement hors périmètre (aucun modèle au schéma pour ça, pas de décision
 * de schéma prise) : incidents techniques, flux d'activité générique, utilisation
 * réelle du stockage (seul `SubscriptionPlan.storageQuotaMb` existe — un quota,
 * pas une mesure d'usage). Le "taux de renouvellement" est également exclu : rien
 * dans le modèle actuel ne distingue un renouvellement d'un simple maintien en
 * statut ACTIVE (pas de job de facturation périodique automatique) — l'exposer
 * reviendrait à inventer un chiffre.
 */

interface RevenueBucket {
  currencyIsoCode: string;
  amountCents: number;
}

interface RevenueByOwnerType extends RevenueBucket {
  ownerType: SubscriberCategory;
}

interface RevenueByPlan extends RevenueBucket {
  planCode: string;
}

interface RevenueByCountry extends RevenueBucket {
  countryIsoCode: string;
}

export interface StatsOverview {
  windowDays: number;
  tenants: {
    total: number;
    active: number;
    byStatus: Record<TenantStatus, number>;
  };
  subscriptions: {
    total: number;
    byOwnerType: Record<SubscriberCategory, number>;
    byStatus: Record<SubscriptionStatus, number>;
    expiringWithinWindow: number;
  };
  licenses: {
    total: number;
    available: number;
    assigned: number;
    revoked: number;
    expired: number;
  };
  revenue: {
    byCurrency: RevenueBucket[];
    annualByCurrency: RevenueBucket[];
    byOwnerType: RevenueByOwnerType[];
    byPlan: RevenueByPlan[];
    byCountry: RevenueByCountry[];
  };
  conversionRate: number | null;
  churnRate: number | null;
  failedPayments: number;
}

function emptyCountRecord<T extends string>(values: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const value of values) {
    record[value] = 0;
  }
  return record;
}

const TENANT_STATUSES: TenantStatus[] = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
];

const SUBSCRIBER_CATEGORIES: SubscriberCategory[] = ["SCHOOL", "PARENT", "STUDENT", "ORGANIZATION"];

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_ACTIVATION",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
];

const ACTIVE_LIKE: ReadonlySet<SubscriptionStatus> = new Set(["ACTIVE", "TRIAL", "GRACE_PERIOD"]);

async function summarizeTenants(): Promise<StatsOverview["tenants"]> {
  const grouped = await prisma.tenant.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });

  const byStatus = emptyCountRecord(TENANT_STATUSES);
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }

  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const active = byStatus.ACTIVE + byStatus.TRIAL;

  return { total, active, byStatus };
}

async function summarizeSubscriptions(
  windowDays: number,
): Promise<{
  summary: StatsOverview["subscriptions"];
  conversionRate: number | null;
  churnRate: number | null;
}> {
  const subscriptions = await prisma.subscription.findMany({
    where: { deletedAt: null },
    select: {
      status: true,
      autoRenew: true,
      endsAt: true,
      trialEndsAt: true,
      owner: { select: { ownerType: true } },
    },
  });

  const byOwnerType = emptyCountRecord(SUBSCRIBER_CATEGORIES);
  const byStatus = emptyCountRecord(SUBSCRIPTION_STATUSES);
  const horizon = new Date(Date.now() + RENEWAL_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  let expiringWithinWindow = 0;

  for (const subscription of subscriptions) {
    byOwnerType[subscription.owner.ownerType] += 1;
    byStatus[subscription.status] += 1;

    if (!subscription.autoRenew || !ACTIVE_LIKE.has(subscription.status)) {
      continue;
    }
    const nextDeadline = subscription.status === "TRIAL" ? subscription.trialEndsAt : subscription.endsAt;
    if (nextDeadline && nextDeadline <= horizon) {
      expiringWithinWindow += 1;
    }
  }

  const [trialStarts, trialConversions, everActive, churned] = await Promise.all([
    prisma.subscriptionEvent.count({ where: { toStatus: "TRIAL" } }),
    prisma.subscriptionEvent.count({ where: { fromStatus: "TRIAL", toStatus: "ACTIVE" } }),
    prisma.subscriptionEvent
      .findMany({
        where: { toStatus: { in: ["ACTIVE", "TRIAL", "GRACE_PERIOD"] } },
        distinct: ["subscriptionId"],
      })
      .then((rows) => rows.length),
    prisma.subscriptionEvent
      .findMany({ where: { toStatus: { in: ["CANCELLED", "REFUNDED"] } }, distinct: ["subscriptionId"] })
      .then((rows) => rows.length),
  ]);

  void windowDays; // le taux de conversion/résiliation est calculé sur toute la durée de vie, pas sur la fenêtre

  return {
    summary: {
      total: subscriptions.length,
      byOwnerType,
      byStatus,
      expiringWithinWindow,
    },
    conversionRate: trialStarts > 0 ? trialConversions / trialStarts : null,
    churnRate: everActive > 0 ? churned / everActive : null,
  };
}

async function summarizeLicenses(): Promise<StatsOverview["licenses"]> {
  const grouped = await prisma.sponsoredLicense.groupBy({ by: ["status"], _count: { _all: true } });
  const byStatus = emptyCountRecord(["AVAILABLE", "ASSIGNED", "REVOKED", "EXPIRED"] as const);
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }
  return {
    total: grouped.reduce((sum, row) => sum + row._count._all, 0),
    available: byStatus.AVAILABLE,
    assigned: byStatus.ASSIGNED,
    revoked: byStatus.REVOKED,
    expired: byStatus.EXPIRED,
  };
}

async function summarizeRevenue(
  windowDays: number,
): Promise<{ revenue: StatsOverview["revenue"]; failedPayments: number }> {
  const since30 = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const since365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [currencies, countries, transactions, failedPayments] = await Promise.all([
    prisma.currency.findMany({ select: { id: true, isoCode: true } }),
    prisma.country.findMany({ select: { id: true, isoCode: true } }),
    prisma.paymentTransaction.findMany({
      where: { status: "SUCCEEDED", occurredAt: { gte: since365 } },
      select: {
        amountCents: true,
        currencyId: true,
        occurredAt: true,
        paymentIntent: {
          select: {
            invoice: {
              select: {
                subscription: {
                  select: {
                    plan: { select: { code: true } },
                    owner: {
                      select: {
                        ownerType: true,
                        tenant: { select: { countryId: true } },
                        organization: { select: { countryId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.paymentTransaction.count({ where: { status: "FAILED", occurredAt: { gte: since30 } } }),
  ]);

  const currencyIsoById = new Map(currencies.map((currency) => [currency.id, currency.isoCode]));
  const countryIsoById = new Map(countries.map((country) => [country.id, country.isoCode]));

  const byCurrency = new Map<string, number>();
  const annualByCurrency = new Map<string, number>();
  const byOwnerType = new Map<string, number>();
  const byPlan = new Map<string, number>();
  const byCountry = new Map<string, number>();

  function add(map: Map<string, number>, key: string, amountCents: number): void {
    map.set(key, (map.get(key) ?? 0) + amountCents);
  }

  for (const tx of transactions) {
    const currencyIsoCode = currencyIsoById.get(tx.currencyId) ?? tx.currencyId;
    add(annualByCurrency, currencyIsoCode, tx.amountCents);
    if (tx.occurredAt >= since30) {
      add(byCurrency, currencyIsoCode, tx.amountCents);
    } else {
      continue;
    }

    const subscription = tx.paymentIntent?.invoice?.subscription;
    if (!subscription) {
      continue;
    }

    add(byOwnerType, `${subscription.owner.ownerType}|${currencyIsoCode}`, tx.amountCents);
    add(byPlan, `${subscription.plan.code}|${currencyIsoCode}`, tx.amountCents);

    const countryId =
      subscription.owner.tenant?.countryId ?? subscription.owner.organization?.countryId ?? null;
    const countryIsoCode = countryId ? (countryIsoById.get(countryId) ?? countryId) : null;
    if (countryIsoCode) {
      add(byCountry, `${countryIsoCode}|${currencyIsoCode}`, tx.amountCents);
    }
  }

  return {
    revenue: {
      byCurrency: [...byCurrency].map(([currencyIsoCode, amountCents]) => ({ currencyIsoCode, amountCents })),
      annualByCurrency: [...annualByCurrency].map(([currencyIsoCode, amountCents]) => ({
        currencyIsoCode,
        amountCents,
      })),
      byOwnerType: [...byOwnerType].map(([key, amountCents]) => {
        const [ownerType, currencyIsoCode] = key.split("|") as [SubscriberCategory, string];
        return { ownerType, currencyIsoCode, amountCents };
      }),
      byPlan: [...byPlan].map(([key, amountCents]) => {
        const [planCode, currencyIsoCode] = key.split("|") as [string, string];
        return { planCode, currencyIsoCode, amountCents };
      }),
      byCountry: [...byCountry].map(([key, amountCents]) => {
        const [countryIsoCode, currencyIsoCode] = key.split("|") as [string, string];
        return { countryIsoCode, currencyIsoCode, amountCents };
      }),
    },
    failedPayments,
  };
}

export async function getStatsOverview(query: StatsOverviewQuery): Promise<StatsOverview> {
  const windowDays = query.windowDays ?? DEFAULT_WINDOW_DAYS;

  const [tenants, subscriptionStats, licenses, revenueStats] = await Promise.all([
    summarizeTenants(),
    summarizeSubscriptions(windowDays),
    summarizeLicenses(),
    summarizeRevenue(windowDays),
  ]);

  return {
    windowDays,
    tenants,
    subscriptions: subscriptionStats.summary,
    licenses,
    revenue: revenueStats.revenue,
    conversionRate: subscriptionStats.conversionRate,
    churnRate: subscriptionStats.churnRate,
    failedPayments: revenueStats.failedPayments,
  };
}
