import { rawPrisma } from "../../lib/prisma.js";

/**
 * Données publiques (sans compte) du site vitrine : pays proposés à l'inscription
 * et grille tarifaire par devise pour le simulateur de la page Tarifs.
 *
 * Tables globales (Country, Currency, SubscriptionPlan, PlanPrice) : jamais
 * cloisonnées par établissement, d'où le client brut.
 */

/** Zones monétaires partageant une même monnaie ou une parité fixe. */
const MONETARY_ZONES: Record<string, { code: string; nameFr: string; nameEn: string }> = {
  XAF: { code: "CEMAC", nameFr: "Zone CEMAC (franc CFA BEAC)", nameEn: "CEMAC zone (CFA franc BEAC)" },
  XOF: { code: "UEMOA", nameFr: "Zone UEMOA (franc CFA BCEAO)", nameEn: "WAEMU zone (CFA franc BCEAO)" },
  ZAR: { code: "CMA", nameFr: "Zone monétaire commune (rand)", nameEn: "Common Monetary Area (rand)" },
  LSL: { code: "CMA", nameFr: "Zone monétaire commune (rand)", nameEn: "Common Monetary Area (rand)" },
  NAD: { code: "CMA", nameFr: "Zone monétaire commune (rand)", nameEn: "Common Monetary Area (rand)" },
  SZL: { code: "CMA", nameFr: "Zone monétaire commune (rand)", nameEn: "Common Monetary Area (rand)" },
};

const currencySelect = {
  isoCode: true,
  nameFr: true,
  nameEn: true,
  symbol: true,
  decimalDigits: true,
} as const;

export async function listPublicCountries() {
  const countries = await rawPrisma.country.findMany({
    where: { isActive: true },
    orderBy: { nameFr: "asc" },
    select: {
      isoCode: true,
      isoAlpha3: true,
      nameFr: true,
      nameEn: true,
      phoneCallingCode: true,
      region: true,
      defaultCurrency: { select: currencySelect },
    },
  });

  return countries.map(({ defaultCurrency, ...country }) => ({
    ...country,
    currency: defaultCurrency,
    monetaryZone: defaultCurrency ? (MONETARY_ZONES[defaultCurrency.isoCode] ?? null) : null,
  }));
}

export async function getPublicPricing() {
  const [plans, prices, rateSetting] = await Promise.all([
    rawPrisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        code: true,
        category: true,
        nameFr: true,
        nameEn: true,
        trialDays: true,
        maxStudents: true,
        maxUsers: true,
        maxCampuses: true,
        childrenCovered: true,
      },
    }),
    // Seuls les prix génériques (sans pays) alimentent le simulateur : un prix
    // spécifique à un pays, s'il existe, est signalé par `countryIsoCode`.
    rawPrisma.planPrice.findMany({
      where: { isActive: true, billingPeriod: "MONTHLY", currency: { isActive: true } },
      select: {
        amountCents: true,
        billingPeriod: true,
        plan: { select: { code: true } },
        currency: { select: { isoCode: true } },
        countryId: true,
      },
    }),
    rawPrisma.platformSetting.findUnique({ where: { key: "pricing.exchangeRateDate" } }),
  ]);

  const countryIds = [...new Set(prices.map((price) => price.countryId).filter((id): id is string => !!id))];
  const countries = countryIds.length
    ? await rawPrisma.country.findMany({
        where: { id: { in: countryIds } },
        select: { id: true, isoCode: true },
      })
    : [];
  const countryIsoById = new Map(countries.map((country) => [country.id, country.isoCode]));

  return {
    exchangeRateDate: typeof rateSetting?.value === "string" ? rateSetting.value : null,
    plans,
    prices: prices.map((price) => ({
      planCode: price.plan.code,
      currencyIsoCode: price.currency.isoCode,
      countryIsoCode: price.countryId ? (countryIsoById.get(price.countryId) ?? null) : null,
      billingPeriod: price.billingPeriod,
      amountCents: price.amountCents,
    })),
  };
}
