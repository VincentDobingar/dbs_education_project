// Prix indicatifs en XAF (Afrique centrale, priorité MVP), génériques (pas de pays
// spécifique) pour amorcer le systeme. A affiner pays par pays en Phase 4/5 une fois
// la tarification commerciale validée.
//
// amountCents = montant * 10^decimalDigits de la devise (convention Stripe-like).
// XAF a decimalDigits=0 (pas de sous-unité réelle), donc amountCents == le montant
// XAF tel quel ici — ne PAS multiplier par 100 comme on le ferait pour une devise
// à 2 décimales (XOF est dans le même cas : voir countries-currencies.ts).
export const PLAN_PRICES = [
  { planCode: "SCHOOL_ESSENTIAL", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 25_000 },
  { planCode: "SCHOOL_PROFESSIONAL", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 65_000 },
  { planCode: "SCHOOL_PREMIUM", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 150_000 },
  { planCode: "PARENT_BASIC", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 1_000 },
  { planCode: "PARENT_PREMIUM", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 2_500 },
  { planCode: "FAMILY_PLAN", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 4_000 },
  { planCode: "STUDENT_BASIC", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 500 },
  { planCode: "STUDENT_PREMIUM", currencyIsoCode: "XAF", billingPeriod: "MONTHLY", amountCents: 1_000 },
] as const;
