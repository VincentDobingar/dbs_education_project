import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

describe("vitrine publique des établissements", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("liste les établissements validés avec leur présentation, sans coordonnées, et respecte le retrait", async () => {
    const { tenant: listed, subdomain } = await createTenant("ShowcaseListed");
    const { tenant: pending } = await createTenant("ShowcasePending");
    createdTenantIds.push(listed.id, pending.id);
    await testAdminPrisma.tenant.update({
      where: { id: listed.id },
      data: { email: "secret@example.test", phone: "+237600000000", city: "Douala" },
    });
    await testAdminPrisma.tenant.update({
      where: { id: pending.id },
      data: { status: "PENDING_VERIFICATION" },
    });

    const owner = await createUser("showcase-owner");
    await addMembership(owner.id, listed.id);
    await grantRole(owner.id, "SCHOOL_OWNER", listed.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    const saved = await request(app)
      .put("/api/v1/school-config/showcase")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ publicDescription: "  Excellence bilingue depuis 1998.  ", showOnHomepage: true });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      publicDescription: "Excellence bilingue depuis 1998.",
      showOnHomepage: true,
    });

    const tooLong = await request(app)
      .put("/api/v1/school-config/showcase")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ publicDescription: "x".repeat(221), showOnHomepage: true });
    expect(tooLong.status).toBe(400);

    const list = await request(app).get("/api/v1/public/schools");
    expect(list.status).toBe(200);
    const schools = list.body as Record<string, unknown>[];
    const entry = schools.find((school) => school.id === listed.id);
    expect(entry).toMatchObject({
      name: listed.name,
      publicDescription: "Excellence bilingue depuis 1998.",
      city: "Douala",
      countryIsoCode: "CM",
    });
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("phone");
    expect(schools.some((school) => school.id === pending.id)).toBe(false);

    await request(app)
      .put("/api/v1/school-config/showcase")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ publicDescription: "", showOnHomepage: false });
    const afterOptOut = await request(app).get("/api/v1/public/schools");
    expect((afterOptOut.body as { id: string }[]).some((school) => school.id === listed.id)).toBe(false);
  });
});
