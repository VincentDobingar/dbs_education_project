/**
 * Copie de la grille tarifaire publique embarquée dans le site web
 * (apps/web/src/content/pricing-snapshot.json) : la page Tarifs l'affiche quand
 * l'API ne répond pas (panne, déploiement en cours). Même forme que les réponses
 * de GET /public/countries et GET /public/pricing.
 *
 * À relancer après toute modification des pays, devises ou prix :
 *   pnpm pricing:snapshot
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { COUNTRIES, CURRENCIES, MONETARY_ZONES } from "./data/countries-currencies.js";
import { EXCHANGE_RATE_DATE, PLAN_PRICES } from "./data/plan-prices.js";
import { SUBSCRIPTION_PLANS } from "./data/subscription-plans.js";

const currencyByCode = new Map<string, (typeof CURRENCIES)[number]>(
  CURRENCIES.map((currency) => [currency.isoCode, currency]),
);

const countries = [...COUNTRIES]
  .sort((a, b) => a.nameFr.localeCompare(b.nameFr, "fr"))
  .map((country) => {
    const currency = currencyByCode.get(country.defaultCurrency)!;
    return {
      isoCode: country.isoCode,
      isoAlpha3: country.isoAlpha3,
      nameFr: country.nameFr,
      nameEn: country.nameEn,
      phoneCallingCode: country.phoneCallingCode,
      region: country.region,
      currency: {
        isoCode: currency.isoCode,
        nameFr: currency.nameFr,
        nameEn: currency.nameEn,
        symbol: currency.symbol,
        decimalDigits: currency.decimalDigits,
      },
      monetaryZone: MONETARY_ZONES[country.defaultCurrency] ?? null,
    };
  });

const plans = SUBSCRIPTION_PLANS.map((plan) => ({
  code: plan.code,
  category: plan.category,
  nameFr: plan.nameFr,
  nameEn: plan.nameEn,
  trialDays: plan.trialDays,
  maxStudents: "maxStudents" in plan ? plan.maxStudents : null,
  maxUsers: "maxUsers" in plan ? plan.maxUsers : null,
  maxCampuses: "maxCampuses" in plan ? plan.maxCampuses : null,
  childrenCovered: "childrenCovered" in plan ? plan.childrenCovered : null,
}));

const prices = PLAN_PRICES.map((price) => ({ ...price, countryIsoCode: null }));

// Lancé depuis la racine du dépôt (script `pricing:snapshot`).
const target = resolve(process.cwd(), "apps/web/src/content/pricing-snapshot.json");
writeFileSync(
  target,
  `${JSON.stringify({ countries, pricing: { exchangeRateDate: EXCHANGE_RATE_DATE, plans, prices } }, null, 2)}\n`,
);
console.log(`Snapshot écrit : ${countries.length} pays, ${prices.length} prix → ${target}`);
