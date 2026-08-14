import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createSubscription, createTenant, createUser, grantRole } from "../fixtures.js";

describe("super-administration — abonnements (§31 tranche 2)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { entityId: { in: createdSubscriptionIds } } });
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscriptionId: { in: createdSubscriptionIds } },
    });
    await testAdminPrisma.subscriptionEvent.deleteMany({
      where: { subscriptionId: { in: createdSubscriptionIds } },
    });
    await testAdminPrisma.subscription.deleteMany({ where: { id: { in: createdSubscriptionIds } } });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({
      where: {
        OR: [{ tenantId: { in: createdTenantIds } }, { userId: { in: createdUserIds }, tenantId: null }],
      },
    });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("liste, transitionne et prolonge l'essai des abonnements — chaque action journalisée", async () => {
    const { tenant: tenantA } = await createTenant("SubAdminTenantA");
    const { tenant: tenantB } = await createTenant("SubAdminTenantB");
    createdTenantIds.push(tenantA.id, tenantB.id);

    const subscriptionA = await createSubscription(
      { tenantId: tenantA.id },
      "SCHOOL",
      "SCHOOL_ESSENTIAL",
      "ACTIVE",
    );
    const subscriptionB = await createSubscription(
      { tenantId: tenantB.id },
      "SCHOOL",
      "SCHOOL_ESSENTIAL",
      "TRIAL",
    );
    createdSubscriptionIds.push(subscriptionA.id, subscriptionB.id);

    const superAdmin = await createUser("subplat-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const ordinaryUser = await createUser("subplat-ordinary");
    createdUserIds.push(ordinaryUser.id);
    await addMembership(ordinaryUser.id, tenantA.id);
    await grantRole(ordinaryUser.id, "SCHOOL_OWNER", tenantA.id);
    const ordinaryToken = signAccessToken({ sub: ordinaryUser.id });

    const list = await request(app)
      .get("/api/v1/platform/subscriptions")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(list.status).toBe(200);
    const listedIds = (list.body as { id: string }[]).map((s) => s.id);
    expect(listedIds).toContain(subscriptionA.id);
    expect(listedIds).toContain(subscriptionB.id);

    const filtered = await request(app)
      .get("/api/v1/platform/subscriptions?status=TRIAL")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect((filtered.body as { id: string }[]).some((s) => s.id === subscriptionB.id)).toBe(true);
    expect((filtered.body as { id: string }[]).some((s) => s.id === subscriptionA.id)).toBe(false);

    const detail = await request(app)
      .get(`/api/v1/platform/subscriptions/${subscriptionA.id}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(detail.status).toBe(200);
    expect((detail.body as { owner: { tenant: { id: string } } }).owner.tenant.id).toBe(tenantA.id);

    const deniedTransition = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/transition`)
      .set("Authorization", `Bearer ${ordinaryToken}`)
      .send({ toStatus: "SUSPENDED", justification: "Impayé" });
    expect(deniedTransition.status).toBe(403);

    const missingJustification = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/transition`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ toStatus: "SUSPENDED" });
    expect(missingJustification.status).toBe(400);

    const suspended = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/transition`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ toStatus: "SUSPENDED", justification: "Impayé constaté" });
    expect(suspended.status).toBe(200);
    expect((suspended.body as { status: string }).status).toBe("SUSPENDED");

    const invalidTransition = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/transition`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ toStatus: "DRAFT", justification: "Tentative invalide" });
    expect(invalidTransition.status).toBe(409);
    expect((invalidTransition.body as { code: string }).code).toBe("INVALID_SUBSCRIPTION_TRANSITION");

    const reactivated = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/transition`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ toStatus: "ACTIVE", justification: "Paiement régularisé" });
    expect(reactivated.status).toBe(200);
    expect((reactivated.body as { status: string }).status).toBe("ACTIVE");

    const notInTrial = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionA.id}/extend-trial`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ trialEndsAt: "2030-01-01", justification: "Test" });
    expect(notInTrial.status).toBe(409);
    expect((notInTrial.body as { code: string }).code).toBe("SUBSCRIPTION_NOT_IN_TRIAL");

    const extended = await request(app)
      .post(`/api/v1/platform/subscriptions/${subscriptionB.id}/extend-trial`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ trialEndsAt: "2030-06-01", justification: "Geste commercial" });
    expect(extended.status).toBe(200);
    expect(new Date((extended.body as { trialEndsAt: string }).trialEndsAt).toISOString().slice(0, 10)).toBe(
      "2030-06-01",
    );

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=Subscription`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => [subscriptionA.id, subscriptionB.id].includes(log.entityId))
      .map((log) => log.action);
    expect(actions).toContain("subscription.transition");
    expect(actions).toContain("subscription.extend_trial");
  }, 20000);
});
