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

  afterAll(async () => {
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
});
