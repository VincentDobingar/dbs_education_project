import { describe, expect, it } from "vitest";

import {
  formatMoney,
  monthlyPriceFor,
  recommendedSchoolPlan,
  type PublicPlan,
  type PublicPricing,
} from "./publicApi.js";

const XAF = { isoCode: "XAF", nameFr: "Franc CFA", nameEn: "CFA franc", symbol: "FCFA", decimalDigits: 0 };
const KES = {
  isoCode: "KES",
  nameFr: "Shilling kényan",
  nameEn: "Kenyan shilling",
  symbol: "KSh",
  decimalDigits: 2,
};

const plan = (code: string, maxStudents: number | null): PublicPlan => ({
  code,
  category: "SCHOOL",
  nameFr: code,
  nameEn: code,
  trialDays: 30,
  maxStudents,
  maxUsers: null,
  maxCampuses: null,
  childrenCovered: null,
});

const PLANS = [
  plan("SCHOOL_PREMIUM", 3000),
  plan("SCHOOL_ESSENTIAL", 300),
  plan("SCHOOL_ENTERPRISE", null),
  plan("SCHOOL_PROFESSIONAL", 1000),
];

describe("recommendedSchoolPlan", () => {
  it("choisit la plus petite formule qui accepte l'effectif", () => {
    expect(recommendedSchoolPlan(PLANS, 250)?.code).toBe("SCHOOL_ESSENTIAL");
    expect(recommendedSchoolPlan(PLANS, 300)?.code).toBe("SCHOOL_ESSENTIAL");
    expect(recommendedSchoolPlan(PLANS, 301)?.code).toBe("SCHOOL_PROFESSIONAL");
    expect(recommendedSchoolPlan(PLANS, 5000)?.code).toBe("SCHOOL_ENTERPRISE");
  });
});

describe("monthlyPriceFor", () => {
  const pricing: PublicPricing = {
    exchangeRateDate: "2026-10-21",
    plans: PLANS,
    prices: [
      {
        planCode: "SCHOOL_ESSENTIAL",
        currencyIsoCode: "KES",
        countryIsoCode: null,
        billingPeriod: "MONTHLY",
        amountCents: 560_000,
      },
      {
        planCode: "SCHOOL_ESSENTIAL",
        currencyIsoCode: "KES",
        countryIsoCode: "KE",
        billingPeriod: "MONTHLY",
        amountCents: 500_000,
      },
      {
        planCode: "SCHOOL_ESSENTIAL",
        currencyIsoCode: "XAF",
        countryIsoCode: null,
        billingPeriod: "MONTHLY",
        amountCents: 25_000,
      },
    ],
  };

  it("préfère le prix propre au pays, sinon le prix de la devise", () => {
    expect(monthlyPriceFor(pricing, "SCHOOL_ESSENTIAL", { isoCode: "KE", currency: KES })).toBe(500_000);
    expect(monthlyPriceFor(pricing, "SCHOOL_ESSENTIAL", { isoCode: "XX", currency: KES })).toBe(560_000);
    expect(monthlyPriceFor(pricing, "SCHOOL_ESSENTIAL", { isoCode: "TD", currency: XAF })).toBe(25_000);
    expect(monthlyPriceFor(pricing, "SCHOOL_PREMIUM", { isoCode: "TD", currency: XAF })).toBeNull();
  });
});

describe("formatMoney", () => {
  it("tient compte des décimales de la devise", () => {
    expect(formatMoney(25_000, XAF, "fr-FR").replace(/\s/g, " ")).toBe("25 000 FCFA");
    expect(formatMoney(560_000, KES, "fr-FR").replace(/\s/g, " ")).toBe("5 600 KSh");
    expect(formatMoney(990, { ...KES, symbol: "GH₵" }, "en-GB")).toBe("9.90 GH₵");
  });
});
