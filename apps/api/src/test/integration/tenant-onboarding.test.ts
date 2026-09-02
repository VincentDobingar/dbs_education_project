import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser, uniqueSuffix } from "../fixtures.js";
import { buildTestApp, type TestResponseBody } from "../test-app.js";

describe("tenant onboarding (§14)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdPromotionCodeIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.promotionRedemption.deleteMany({
      where: { promotionCodeId: { in: createdPromotionCodeIds } },
    });
    await testAdminPrisma.promotionCode.deleteMany({ where: { id: { in: createdPromotionCodeIds } } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  function onboardingPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `Onboard School ${uniqueSuffix()}`,
      ownershipType: "PRIVATE",
      countryIsoCode: "CM",
      currencyIsoCode: "XAF",
      subdomain: `onb-${uniqueSuffix()}`,
      ...overrides,
    };
  }

  // Reproduit exactement l'assistant d'inscription public (SignupPage.tsx) :
  // register -> verify-email (jeton renvoyé par register, §34 sans fournisseur
  // email réel) -> login -> onboarding. Contrairement aux autres tests de ce
  // fichier, qui créent l'utilisateur directement via createUser()/signAccessToken
  // en contournant tout le flux HTTP réel, celui-ci l'exerce intégralement — c'est
  // le seul test qui aurait détecté que login rejette un compte encore PENDING.
  it("registers, verifies the email token from the registration response, logs in, then onboards — mirrors the public signup wizard exactly", async () => {
    const email = `founder-e2e-${uniqueSuffix()}@example.test`;
    const password = "Sup3r-Secret-Passw0rd!";

    const registered = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password, firstName: "Awa", lastName: "Ngo" });
    expect(registered.status).toBe(201);
    const registeredBody = registered.body as { status: string; emailVerificationToken: string };
    expect(registeredBody.status).toBe("PENDING");

    const prematureLogin = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(prematureLogin.status).toBe(403);
    expect((prematureLogin.body as TestResponseBody).code).toBe("ACCOUNT_NOT_ACTIVE");

    const verified = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: registeredBody.emailVerificationToken });
    expect(verified.status).toBe(200);
    expect((verified.body as { status: string }).status).toBe("ACTIVE");

    const loggedIn = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loggedIn.status).toBe(200);
    const { accessToken } = loggedIn.body as { accessToken: string };

    const payload = onboardingPayload();
    const onboarded = await request(app)
      .post("/api/v1/tenants/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    expect(onboarded.status).toBe(201);
    createdTenantIds.push((onboarded.body as { tenant: { id: string } }).tenant.id);
  }, 15000);

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).post("/api/v1/tenants/onboarding").send(onboardingPayload());

    expect(response.status).toBe(401);
  });

  it("creates the tenant, its domain, and grants the caller SCHOOL_OWNER", async () => {
    const user = await createUser("founder");
    const token = signAccessToken({ sub: user.id });
    const payload = onboardingPayload();

    const response = await request(app)
      .post("/api/v1/tenants/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(201);
    const body = response.body as { tenant: { id: string; status: string }; subdomain: string };
    createdTenantIds.push(body.tenant.id);

    expect(body.tenant.status).toBe("PENDING_VERIFICATION");
    expect(body.subdomain).toBe(payload.subdomain);

    const membership = await testAdminPrisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: user.id, tenantId: body.tenant.id } },
    });
    expect(membership.status).toBe("ACTIVE");

    const ownerRole = await testAdminPrisma.role.findUniqueOrThrow({ where: { code: "SCHOOL_OWNER" } });
    const userRole = await testAdminPrisma.userRole.findFirst({
      where: { userId: user.id, tenantId: body.tenant.id, roleId: ownerRole.id },
    });
    expect(userRole).not.toBeNull();

    const domain = await testAdminPrisma.tenantDomain.findUniqueOrThrow({
      where: { subdomain: payload.subdomain },
    });
    expect(domain.verifiedAt).not.toBeNull();
  });

  it("rejects a second tenant claiming the same subdomain", async () => {
    const user = await createUser("founder-dup");
    const token = signAccessToken({ sub: user.id });
    const payload = onboardingPayload();

    const first = await request(app)
      .post("/api/v1/tenants/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    createdTenantIds.push((first.body as { tenant: { id: string } }).tenant.id);

    const second = await request(app)
      .post("/api/v1/tenants/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(second.status).toBe(409);
    expect((second.body as TestResponseBody).code).toBe("SUBDOMAIN_TAKEN");
  });

  it("creates a DRAFT subscription when a planCode is provided, and the new owner can immediately use requireAuth on their tenant", async () => {
    const user = await createUser("founder-plan");
    const token = signAccessToken({ sub: user.id });
    const payload = onboardingPayload({ planCode: "SCHOOL_ESSENTIAL", billingPeriod: "MONTHLY" });

    const response = await request(app)
      .post("/api/v1/tenants/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    const body = response.body as { tenant: { id: string }; subscription: { status: string } | null };
    createdTenantIds.push(body.tenant.id);

    expect(body.subscription).not.toBeNull();
    expect(body.subscription?.status).toBe("DRAFT");

    // Sanity check the new session is a real, usable identity, not just a token shape.
    const miniApp = buildTestApp(requireAuth);
    const authCheck = await request(miniApp).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(authCheck.status).toBe(200);
  });

  describe("consommation de codes promotionnels (§31 tranche 8)", () => {
    async function createPromotionCode(overrides: Record<string, unknown> = {}) {
      const promotionCode = await testAdminPrisma.promotionCode.create({
        data: {
          code: `PROMO-${uniqueSuffix()}`,
          discountType: "PERCENTAGE",
          discountValue: 10,
          isActive: true,
          ...overrides,
        },
      });
      createdPromotionCodeIds.push(promotionCode.id);
      return promotionCode;
    }

    it("redeems a valid promo code and increments its redemption count", async () => {
      const promotionCode = await createPromotionCode();
      const user = await createUser("founder-promo");
      const token = signAccessToken({ sub: user.id });
      const payload = onboardingPayload({
        planCode: "SCHOOL_ESSENTIAL",
        billingPeriod: "MONTHLY",
        promoCode: promotionCode.code,
      });

      const response = await request(app)
        .post("/api/v1/tenants/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

      expect(response.status).toBe(201);
      const body = response.body as { tenant: { id: string }; subscription: { id: string } | null };
      createdTenantIds.push(body.tenant.id);
      expect(body.subscription).not.toBeNull();

      const redemption = await testAdminPrisma.promotionRedemption.findUnique({
        where: {
          promotionCodeId_subscriptionId: {
            promotionCodeId: promotionCode.id,
            subscriptionId: body.subscription?.id ?? "",
          },
        },
      });
      expect(redemption).not.toBeNull();
      expect(redemption?.redeemedByUserId).toBe(user.id);

      const updatedCode = await testAdminPrisma.promotionCode.findUniqueOrThrow({
        where: { id: promotionCode.id },
      });
      expect(updatedCode.redemptionCount).toBe(1);
    });

    it("rejects an unknown promo code", async () => {
      const user = await createUser("founder-promo-unknown");
      const token = signAccessToken({ sub: user.id });
      const payload = onboardingPayload({
        planCode: "SCHOOL_ESSENTIAL",
        billingPeriod: "MONTHLY",
        promoCode: `PROMO-DOES-NOT-EXIST-${uniqueSuffix()}`,
      });

      const response = await request(app)
        .post("/api/v1/tenants/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

      expect(response.status).toBe(404);
      expect((response.body as TestResponseBody).code).toBe("PROMOTION_CODE_NOT_FOUND");
    });

    it("rejects a promo code that has reached its redemption limit", async () => {
      const promotionCode = await createPromotionCode({ maxRedemptions: 1, redemptionCount: 1 });
      const user = await createUser("founder-promo-exhausted");
      const token = signAccessToken({ sub: user.id });
      const payload = onboardingPayload({
        planCode: "SCHOOL_ESSENTIAL",
        billingPeriod: "MONTHLY",
        promoCode: promotionCode.code,
      });

      const response = await request(app)
        .post("/api/v1/tenants/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

      expect(response.status).toBe(409);
      expect((response.body as TestResponseBody).code).toBe("PROMOTION_CODE_EXHAUSTED");
    });

    it("refuses to let two concurrent onboardings both redeem a maxRedemptions:1 code (increment must be atomic)", async () => {
      // §31 : `redeemPromotionCode` gagnait le check `redemptionCount >= maxRedemptions`
      // puis écrivait l'incrément dans un `update` séparé — deux onboardings concurrents
      // avec le même code passaient tous deux le check avant que l'un des deux
      // n'incrémente, dépassant le plafond de redemptions.
      const promotionCode = await createPromotionCode({ maxRedemptions: 1, redemptionCount: 0 });
      const userA = await createUser("founder-promo-race-a");
      const userB = await createUser("founder-promo-race-b");
      const tokenA = signAccessToken({ sub: userA.id });
      const tokenB = signAccessToken({ sub: userB.id });
      const payloadA = onboardingPayload({
        planCode: "SCHOOL_ESSENTIAL",
        billingPeriod: "MONTHLY",
        promoCode: promotionCode.code,
      });
      const payloadB = onboardingPayload({
        planCode: "SCHOOL_ESSENTIAL",
        billingPeriod: "MONTHLY",
        promoCode: promotionCode.code,
      });

      const [responseA, responseB] = await Promise.all([
        request(app)
          .post("/api/v1/tenants/onboarding")
          .set("Authorization", `Bearer ${tokenA}`)
          .send(payloadA),
        request(app)
          .post("/api/v1/tenants/onboarding")
          .set("Authorization", `Bearer ${tokenB}`)
          .send(payloadB),
      ]);
      for (const response of [responseA, responseB]) {
        if (response.status === 201) {
          createdTenantIds.push((response.body as { tenant: { id: string } }).tenant.id);
        }
      }

      const statuses = [responseA.status, responseB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const updatedCode = await testAdminPrisma.promotionCode.findUniqueOrThrow({
        where: { id: promotionCode.id },
      });
      expect(updatedCode.redemptionCount).toBe(1);
    });

    it("rejects a promo code submitted without a planCode", async () => {
      const user = await createUser("founder-promo-no-plan");
      const token = signAccessToken({ sub: user.id });
      const payload = onboardingPayload({ promoCode: `PROMO-${uniqueSuffix()}` });

      const response = await request(app)
        .post("/api/v1/tenants/onboarding")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

      expect(response.status).toBe(400);
    });
  });
});
