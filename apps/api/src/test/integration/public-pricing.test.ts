import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";

// Routes publiques du site vitrine (inscription, simulateur de la page Tarifs) :
// lisibles sans compte. Données de test autonomes, indépendantes du seed.
describe("routes publiques — pays et tarifs par devise", () => {
  const app = createApp();
  const countryCode = "ZY";
  const currencyCode = "ZYX";

  async function cleanup(): Promise<void> {
    await testAdminPrisma.planPrice.deleteMany({ where: { currency: { isoCode: currencyCode } } });
    await testAdminPrisma.country.deleteMany({ where: { isoCode: countryCode } });
    await testAdminPrisma.currency.deleteMany({ where: { isoCode: currencyCode } });
  }

  beforeAll(async () => {
    await cleanup();
    const currency = await testAdminPrisma.currency.create({
      data: {
        isoCode: currencyCode,
        nameFr: "Monnaie test",
        nameEn: "Test currency",
        symbol: "T",
        decimalDigits: 2,
      },
    });
    await testAdminPrisma.country.create({
      data: {
        isoCode: countryCode,
        isoAlpha3: "ZYZ",
        region: "WEST_AFRICA",
        nameFr: "Pays test",
        nameEn: "Test country",
        phoneCallingCode: "+999",
        defaultCurrencyId: currency.id,
      },
    });
    const plan = await testAdminPrisma.subscriptionPlan.findFirstOrThrow({ where: { category: "SCHOOL" } });
    await testAdminPrisma.planPrice.create({
      data: { planId: plan.id, currencyId: currency.id, billingPeriod: "MONTHLY", amountCents: 123_400 },
    });
  });

  afterAll(cleanup);

  it("liste les pays actifs avec codes ISO, indicatif, région et devise, sans authentification", async () => {
    const response = await request(app).get("/api/v1/public/countries");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("max-age");
    const countries = response.body as { isoCode: string }[];
    expect(countries.find((country) => country.isoCode === countryCode)).toMatchObject({
      isoAlpha3: "ZYZ",
      phoneCallingCode: "+999",
      region: "WEST_AFRICA",
      currency: { isoCode: currencyCode, decimalDigits: 2 },
      monetaryZone: null,
    });
    expect(countries.find((country) => country.isoCode === "CM")).toMatchObject({
      currency: { isoCode: "XAF" },
      monetaryZone: { code: "CEMAC" },
    });
  });

  it("expose les formules et leurs prix mensuels par devise", async () => {
    const response = await request(app).get("/api/v1/public/pricing");

    expect(response.status).toBe(200);
    const pricing = response.body as {
      plans: { code: string; category: string }[];
      prices: {
        planCode: string;
        currencyIsoCode: string;
        countryIsoCode: string | null;
        amountCents: number;
      }[];
    };
    expect(pricing.plans.some((plan) => plan.category === "SCHOOL")).toBe(true);
    expect(pricing.prices).toContainEqual(
      expect.objectContaining({ currencyIsoCode: currencyCode, countryIsoCode: null, amountCents: 123_400 }),
    );
  });
});
