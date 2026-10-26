import { apiRequest } from "./apiClient.js";

/** Données publiques du site vitrine (sans compte) : pays et grille tarifaire. */

export type CountryRegion =
  "CENTRAL_AFRICA" | "EAST_AFRICA" | "NORTH_AFRICA" | "SOUTHERN_AFRICA" | "WEST_AFRICA";

export interface PublicCurrency {
  isoCode: string;
  nameFr: string;
  nameEn: string;
  symbol: string;
  decimalDigits: number;
}

export interface MonetaryZone {
  code: string;
  nameFr: string;
  nameEn: string;
}

export interface PublicCountry {
  isoCode: string;
  isoAlpha3: string | null;
  nameFr: string;
  nameEn: string;
  phoneCallingCode: string;
  region: CountryRegion | null;
  currency: PublicCurrency | null;
  monetaryZone: MonetaryZone | null;
}

export interface PublicPlan {
  code: string;
  category: "SCHOOL" | "PARENT" | "STUDENT" | "ORGANIZATION";
  nameFr: string;
  nameEn: string;
  trialDays: number;
  maxStudents: number | null;
  maxUsers: number | null;
  maxCampuses: number | null;
  childrenCovered: number | null;
}

export interface PublicPrice {
  planCode: string;
  currencyIsoCode: string;
  countryIsoCode: string | null;
  billingPeriod: string;
  amountCents: number;
}

export interface PublicPricing {
  exchangeRateDate: string | null;
  plans: PublicPlan[];
  prices: PublicPrice[];
}

export function listPublicCountries(): Promise<PublicCountry[]> {
  return apiRequest("/public/countries");
}

export function getPublicPricing(): Promise<PublicPricing> {
  return apiRequest("/public/pricing");
}

/** Ordre d'affichage des régions dans les listes de pays. */
export const REGION_ORDER: readonly CountryRegion[] = [
  "CENTRAL_AFRICA",
  "WEST_AFRICA",
  "EAST_AFRICA",
  "SOUTHERN_AFRICA",
  "NORTH_AFRICA",
];

/** Prix mensuel d'une formule pour un pays : prix propre au pays, sinon prix de sa devise. */
export function monthlyPriceFor(
  pricing: PublicPricing,
  planCode: string,
  country: Pick<PublicCountry, "isoCode" | "currency">,
): number | null {
  const currency = country.currency?.isoCode;
  if (!currency) {
    return null;
  }
  const candidates = pricing.prices.filter(
    (price) =>
      price.planCode === planCode && price.currencyIsoCode === currency && price.billingPeriod === "MONTHLY",
  );
  const specific = candidates.find((price) => price.countryIsoCode === country.isoCode);
  const generic = candidates.find((price) => price.countryIsoCode === null);
  return (specific ?? generic)?.amountCents ?? null;
}

/** « 25 000 FCFA », « 5 600 KSh », « 43 $ » — montant en unités mineures vers texte. */
export function formatMoney(amountCents: number, currency: PublicCurrency, locale: string): string {
  const amount = amountCents / 10 ** currency.decimalDigits;
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: currency.decimalDigits,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : Math.min(2, currency.decimalDigits),
  }).format(amount);
  return `${number} ${currency.symbol}`;
}

/** Plus petite formule établissement qui accepte `studentCount` élèves (null = illimité). */
export function recommendedSchoolPlan(plans: PublicPlan[], studentCount: number): PublicPlan | null {
  const schoolPlans = plans
    .filter((plan) => plan.category === "SCHOOL")
    .sort((a, b) => (a.maxStudents ?? Infinity) - (b.maxStudents ?? Infinity));
  return schoolPlans.find((plan) => plan.maxStudents === null || plan.maxStudents >= studentCount) ?? null;
}

interface PricingSnapshot {
  countries: PublicCountry[];
  pricing: PublicPricing;
}

/** Copie embarquée (content/pricing-snapshot.json, `pnpm pricing:snapshot`), chargée à la demande. */
async function loadSnapshot(): Promise<PricingSnapshot> {
  const module = (await import("../content/pricing-snapshot.json")) as { default: PricingSnapshot };
  return module.default;
}

/**
 * Pour la page Tarifs : l'API d'abord (prix éventuellement ajustés par pays), la
 * copie embarquée si elle ne répond pas — le simulateur reste utilisable pendant
 * une panne ou un déploiement de l'API. L'inscription, elle, n'utilise que l'API :
 * un pays absent de la base y serait refusé.
 */
export async function listPublicCountriesOrSnapshot(): Promise<PublicCountry[]> {
  try {
    return await listPublicCountries();
  } catch {
    return (await loadSnapshot()).countries;
  }
}

export async function getPublicPricingOrSnapshot(): Promise<PublicPricing> {
  try {
    return await getPublicPricing();
  } catch {
    return (await loadSnapshot()).pricing;
  }
}

/** Établissement présenté dans la vitrine « Ils nous font confiance » de la page d'accueil. */
export interface ShowcaseSchool {
  id: string;
  name: string;
  logoUrl: string | null;
  publicDescription: string | null;
  ownershipType: "PUBLIC" | "PRIVATE";
  city: string | null;
  countryIsoCode: string;
  countryNameFr: string;
  countryNameEn: string;
}

export function listShowcaseSchools(): Promise<ShowcaseSchool[]> {
  return apiRequest("/public/schools");
}
