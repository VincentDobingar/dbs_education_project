import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createSubscription, createTenant, createUser, grantRole } from "../fixtures.js";
import type { TestResponseBody } from "../test-app.js";

// §3.1 : « un établissement doit disposer d'un abonnement actif pour utiliser les
// modules administratifs, académiques, financiers et de communication » — jusqu'ici
// requireActiveSubscription n'était câblé sur aucune route côté établissement (seuls
// les portails parent/élève l'avaient, §37), donc un tenant sans abonnement actif
// (ou dont l'abonnement a expiré/été annulé) gardait un accès total et permanent à
// tous ses modules. Fermé en câblant requireActiveSubscription() sur chaque routeur
// tenant-scoped ; prouvé ici de bout en bout sur deux modules représentatifs
// (finance, school-config) plutôt qu'un seul, pour montrer que ce n'est pas
// accidentel à un module en particulier.
describe("garde d'abonnement actif sur les routes établissement (§3.1)", () => {
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

  it("blocks finance and school-config routes when the tenant has no subscription, then allows them once one is active", async () => {
    const { tenant, subdomain } = await createTenant("SubGate", { activeSubscription: false });
    createdTenantIds.push(tenant.id);

    const owner = await createUser("subgate-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const token = signAccessToken({ sub: owner.id });

    const financeBefore = await request(app)
      .get("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", subdomain);
    expect(financeBefore.status).toBe(402);
    expect((financeBefore.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");

    const schoolConfigBefore = await request(app)
      .get("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", subdomain);
    expect(schoolConfigBefore.status).toBe(402);
    expect((schoolConfigBefore.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");

    await createSubscription({ tenantId: tenant.id }, "SCHOOL", "SCHOOL_ESSENTIAL", "ACTIVE");

    const financeAfter = await request(app)
      .get("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", subdomain);
    expect(financeAfter.status).toBe(200);

    const schoolConfigAfter = await request(app)
      .get("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", subdomain);
    expect(schoolConfigAfter.status).toBe(200);
  });

  it("blocks tenant routes again once the subscription is cancelled, without deleting the underlying data", async () => {
    const { tenant, subdomain } = await createTenant("SubGateCancel", { activeSubscription: false });
    createdTenantIds.push(tenant.id);

    const owner = await createUser("subgate-cancel-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const token = signAccessToken({ sub: owner.id });

    await createSubscription({ tenantId: tenant.id }, "SCHOOL", "SCHOOL_ESSENTIAL", "CANCELLED");

    const response = await request(app)
      .get("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", subdomain);
    expect(response.status).toBe(402);

    const stillThere = await testAdminPrisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(stillThere.id).toBe(tenant.id);
  });
});
