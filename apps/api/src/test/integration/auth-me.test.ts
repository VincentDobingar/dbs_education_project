import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

const PASSWORD = "Sup3r-Secret-Passw0rd!";

interface CurrentUserResponse {
  id: string;
  email: string;
  tenantMemberships: { tenantId: string; tenantName: string; subdomain: string; roleCodes: string[] }[];
}

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return (response.body as { accessToken: string }).accessToken;
}

// L'accès access token ne porte que `sub` (§34) — sans cette route, le frontend
// n'a aucun moyen de savoir qui est connecté ni à quel(s) établissement(s)/rôle(s)
// il appartient une fois authentifié.
describe("identité courante (GET /auth/me)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("rejects a request without a bearer token", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  it("returns an empty tenant list for a user with no establishment yet", async () => {
    const user = await createUser("me-no-tenant");
    createdUserIds.push(user.id);
    const accessToken = await login(app, user.email);

    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    const body = response.body as CurrentUserResponse;
    expect(body.id).toBe(user.id);
    expect(body.email).toBe(user.email);
    expect(body.tenantMemberships).toEqual([]);
  });

  it("returns the tenant and role codes for a school owner", async () => {
    const user = await createUser("me-owner");
    createdUserIds.push(user.id);
    const { tenant, subdomain } = await createTenant("Me Owner School");
    createdTenantIds.push(tenant.id);
    await addMembership(user.id, tenant.id);
    await grantRole(user.id, "SCHOOL_OWNER", tenant.id);

    const accessToken = await login(app, user.email);
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    const body = response.body as CurrentUserResponse;
    expect(body.tenantMemberships).toHaveLength(1);
    expect(body.tenantMemberships[0]?.tenantId).toBe(tenant.id);
    expect(body.tenantMemberships[0]?.subdomain).toBe(subdomain);
    expect(body.tenantMemberships[0]?.roleCodes).toEqual(["SCHOOL_OWNER"]);
  });

  it("does not mix roles between two different tenants of the same user", async () => {
    const user = await createUser("me-multi-tenant");
    createdUserIds.push(user.id);
    const first = await createTenant("Me Multi A");
    const second = await createTenant("Me Multi B");
    createdTenantIds.push(first.tenant.id, second.tenant.id);
    await addMembership(user.id, first.tenant.id);
    await addMembership(user.id, second.tenant.id);
    await grantRole(user.id, "SCHOOL_OWNER", first.tenant.id);
    await grantRole(user.id, "DIRECTOR", second.tenant.id);

    const accessToken = await login(app, user.email);
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    const body = response.body as CurrentUserResponse;
    expect(body.tenantMemberships).toHaveLength(2);
    const byTenantId = new Map(body.tenantMemberships.map((membership) => [membership.tenantId, membership]));
    expect(byTenantId.get(first.tenant.id)?.roleCodes).toEqual(["SCHOOL_OWNER"]);
    expect(byTenantId.get(second.tenant.id)?.roleCodes).toEqual(["DIRECTOR"]);
  });
});
