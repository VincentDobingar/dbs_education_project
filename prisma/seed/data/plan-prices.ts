import { CURRENCIES, type CurrencyIsoCode } from "./countries-currencies.js";

// Tarifs de référence en francs CFA (XAF), mensuels. Le franc CFA BCEAO (XOF) a la
// même parité fixe avec l'euro que le XAF : mêmes montants dans les deux zones.
//
// Pour les autres monnaies africaines, le prix est la conversion du tarif XAF au
// taux de référence ci-dessous, arrondie à deux chiffres significatifs (ex. 5 552
// KSh → 5 600 KSh). Ce sont des prix indicatifs, appliqués aux factures tant
// qu'aucun prix spécifique à un pays n'est saisi : pour ajuster un marché (pouvoir
// d'achat, prix psychologique), ajouter une ligne avec countryId plutôt que de
// modifier les taux.
//
// amountCents = montant × 10^decimalDigits de la devise (XAF : 0 décimale, donc
// amountCents est le montant en francs ; ZAR : 2 décimales, 700 R → 70 000).

/** Date des taux de change utilisés (XE, 21 octobre 2026, 16 h UTC). */
export const EXCHANGE_RATE_DATE = "2026-10-21";

/** Unités de chaque monnaie pour 1 franc CFA (XAF). */
export const UNITS_PER_XAF: Record<Exclude<CurrencyIsoCode, "XAF">, number> = {
  AOA: 1.56378,
  BIF: 5.1326,
  BWP: 0.023019,
  CDF: 3.9527,
  CVE: 0.168106,
  DJF: 0.304611,
  DZD: 0.230271,
  EGP: 0.0930156,
  ERN: 0.0256571,
  ETB: 0.275814,
  GHS: 0.0198767,
  GMD: 0.127612,
  GNF: 15.1415,
  KES: 0.222109,
  KMF: 0.75,
  LRD: 0.291765,
  LSL: 0.0280146,
  LYD: 0.0109706,
  MAD: 0.0167499,
  MGA: 7.85303,
  MRU: 0.0686374,
  MUR: 0.0808737,
  MWK: 2.96496,
  MZN: 0.108683,
  NAD: 0.0280146,
  NGN: 2.27796,
  RWF: 2.52336,
  SCR: 0.0254925,
  SDG: 1.02653,
  SLE: 0.0392201,
  SOS: 0.977643,
  SSP: 9.82727,
  STN: 0.0377249,
  SZL: 0.0280146,
  TND: 0.00512668,
  TZS: 4.50253,
  UGX: 7.19505,
  USD: 0.00171048,
  XOF: 1.0,
  ZAR: 0.0280146,
  ZMW: 0.0344666,
  ZWG: 0.0456095,
};

export const BASE_MONTHLY_PRICES_XAF = {
  SCHOOL_ESSENTIAL: 25_000,
  SCHOOL_PROFESSIONAL: 65_000,
  SCHOOL_PREMIUM: 150_000,
  PARENT_BASIC: 1_000,
  PARENT_PREMIUM: 2_500,
  FAMILY_PLAN: 4_000,
  STUDENT_BASIC: 500,
  STUDENT_PREMIUM: 1_000,
} as const;

export type PricedPlanCode = keyof typeof BASE_MONTHLY_PRICES_XAF;

/** Arrondi commercial à deux chiffres significatifs, jamais sous l'unité mineure. */
export function roundToNiceAmount(amount: number, decimalDigits: number): number {
  if (amount <= 0) {
    return 0;
  }
  const magnitude = 10 ** (Math.floor(Math.log10(amount)) - 1);
  const minorUnit = 10 ** -decimalDigits;
  const step = Math.max(magnitude, minorUnit);
  return Math.round(amount / step) * step;
}

/** Montant en unités mineures (amountCents) d'un tarif XAF converti dans `currency`. */
export function convertedAmountCents(amountXaf: number, currency: CurrencyIsoCode): number {
  const { decimalDigits } = CURRENCIES.find((entry) => entry.isoCode === currency)!;
  if (currency === "XAF" || currency === "XOF") {
    return amountXaf;
  }
  const amount = roundToNiceAmount(amountXaf * UNITS_PER_XAF[currency], decimalDigits);
  return Math.round(amount * 10 ** decimalDigits);
}

export const PLAN_PRICES = CURRENCIES.flatMap((currency) =>
  (Object.keys(BASE_MONTHLY_PRICES_XAF) as PricedPlanCode[]).map((planCode) => ({
    planCode,
    currencyIsoCode: currency.isoCode,
    billingPeriod: "MONTHLY" as const,
    amountCents: convertedAmountCents(BASE_MONTHLY_PRICES_XAF[planCode], currency.isoCode),
  })),
);
