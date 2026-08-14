import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("super-administration — pays, devises, moyens de paiement (§31 tranche 3)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const testCountryCode = "ZZ";
  const testCurrencyCode = "ZZZ";

  beforeAll(async () => {
    // Nettoyage défensif si une exécution précédente n'a pas pu se terminer.
    await testAdminPrisma.country.deleteMany({ where: { isoCode: testCountryCode } });
    await testAdminPrisma.currency.deleteMany({ where: { isoCode: testCurrencyCode } });
  });

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.country.deleteMany({ where: { isoCode: testCountryCode } });
    await testAdminPrisma.currency.deleteMany({ where: { isoCode: testCurrencyCode } });
    await testAdminPrisma.paymentProvider.deleteMany({ where: { code: { startsWith: "PROV-TEST-" } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
  });

  it("gère pays, devises et moyens de paiement — doublons refusés, moindre privilège respecté", async () => {
    const superAdmin = await createUser("refdata-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("refdata-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const ordinary = await createUser("refdata-ordinary");
    createdUserIds.push(ordinary.id);
    const ordinaryToken = signAccessToken({ sub: ordinary.id });

    const listDenied = await request(app)
      .get("/api/v1/platform/countries")
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(listDenied.status).toBe(403);

    const listCountries = await request(app)
      .get("/api/v1/platform/countries")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(listCountries.status).toBe(200);
    expect((listCountries.body as { isoCode: string }[]).some((c) => c.isoCode === "CM")).toBe(true);

    const createDeniedForAuditor = await request(app)
      .post("/api/v1/platform/countries")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ isoCode: testCountryCode, nameFr: "Zed", nameEn: "Zed", phoneCallingCode: "+000" });
    expect(createDeniedForAuditor.status).toBe(403);

    const duplicateCountry = await request(app)
      .post("/api/v1/platform/countries")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isoCode: "CM", nameFr: "Doublon", nameEn: "Duplicate", phoneCallingCode: "+237" });
    expect(duplicateCountry.status).toBe(409);
    expect((duplicateCountry.body as { code: string }).code).toBe("COUNTRY_ISO_CODE_TAKEN");

    const createdCountry = await request(app)
      .post("/api/v1/platform/countries")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isoCode: testCountryCode, nameFr: "Zédie", nameEn: "Zedland", phoneCallingCode: "+999" });
    expect(createdCountry.status).toBe(201);
    const countryId = (createdCountry.body as { id: string }).id;

    const createdCurrency = await request(app)
      .post("/api/v1/platform/currencies")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isoCode: testCurrencyCode, nameFr: "Zed franc", nameEn: "Zed franc", symbol: "Z" });
    expect(createdCurrency.status).toBe(201);
    const currencyId = (createdCurrency.body as { id: string }).id;

    const invalidCurrencyRef = await request(app)
      .patch(`/api/v1/platform/countries/${countryId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ defaultCurrencyId: "does-not-exist" });
    expect(invalidCurrencyRef.status).toBe(404);
    expect((invalidCurrencyRef.body as { code: string }).code).toBe("CURRENCY_NOT_FOUND");

    const updatedCountry = await request(app)
      .patch(`/api/v1/platform/countries/${countryId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ defaultCurrencyId: currencyId, justification: "Rattachement de la devise par défaut" });
    expect(updatedCountry.status).toBe(200);
    expect((updatedCountry.body as { defaultCurrencyId: string }).defaultCurrencyId).toBe(currencyId);

    const providerCode = `PROV-TEST-${uniqueSuffix()}`;
    const createdProvider = await request(app)
      .post("/api/v1/platform/payment-providers")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        code: providerCode,
        nameFr: "Fournisseur test",
        nameEn: "Test provider",
        methodType: "MOBILE_MONEY",
      });
    expect(createdProvider.status).toBe(201);
    const providerId = (createdProvider.body as { id: string }).id;

    const duplicateProvider = await request(app)
      .post("/api/v1/platform/payment-providers")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code: providerCode, nameFr: "Autre", nameEn: "Other", methodType: "CARD" });
    expect(duplicateProvider.status).toBe(409);
    expect((duplicateProvider.body as { code: string }).code).toBe("PAYMENT_PROVIDER_CODE_TAKEN");

    const updatedProvider = await request(app)
      .patch(`/api/v1/platform/payment-providers/${providerId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(updatedProvider.status).toBe(200);
    expect((updatedProvider.body as { isActive: boolean }).isActive).toBe(false);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=Country`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === countryId)
      .map((log) => log.action);
    expect(actions).toContain("country.create");
    expect(actions).toContain("country.update");
  }, 20000);
});
