import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import * as paymentService from "../../modules/payments/payment.service.js";
import * as licenseAdminService from "../../modules/platform-admin/license-admin.service.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, createUser, grantRole } from "../fixtures.js";

interface StatsOverviewBody {
  tenants: { total: number; byStatus: Record<string, number> };
  subscriptions: { total: number; byOwnerType: Record<string, number>; byStatus: Record<string, number> };
  licenses: { total: number; available: number; assigned: number };
  revenue: { byCurrency: { currencyIsoCode: string; amountCents: number }[] };
  conversionRate: number | null;
  churnRate: number | null;
}

// Cette suite lit un agrégat GLOBAL (toutes les tenants/abonnements confondus) —
// contrairement aux autres tests platform-admin, il n'existe pas de filtre par
// entité pour isoler nos propres fixtures. Comme la base de test est partagée
// entre fichiers exécutés en parallèle, les assertions comparent un instantané
// "avant" et "après" avec des bornes >= plutôt que des égalités exactes, seule
// méthode robuste à la pollution d'autres suites tournant en même temps.
describe("super-administration — statistiques et indicateurs commerciaux (§31 tranche 9)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdBatchIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.licenseAssignment.deleteMany({
      where: { license: { batchId: { in: createdBatchIds } } },
    });
    await testAdminPrisma.sponsoredLicense.deleteMany({ where: { batchId: { in: createdBatchIds } } });
    await testAdminPrisma.licenseBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
    await testAdminPrisma.receipt.deleteMany({
      where: {
        paymentTransaction: {
          paymentIntent: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
        },
      },
    });
    await testAdminPrisma.paymentTransaction.deleteMany({
      where: {
        paymentIntent: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
      },
    });
    await testAdminPrisma.paymentIntent.deleteMany({
      where: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.invoiceItem.deleteMany({
      where: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.invoice.deleteMany({
      where: { subscription: { owner: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.billingAccount.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.subscriptionEvent.deleteMany({
      where: { subscription: { owner: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("agrège établissements, abonnements, licences et revenus — moindre privilège respecté", async () => {
    const superAdmin = await createUser("stats-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const ordinaryUser = await createUser("stats-ordinary");
    createdUserIds.push(ordinaryUser.id);
    const ordinaryToken = signAccessToken({ sub: ordinaryUser.id });

    const denied = await request(app)
      .get("/api/v1/platform/stats/overview")
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(denied.status).toBe(403);

    const before = await request(app)
      .get("/api/v1/platform/stats/overview")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(before.status).toBe(200);
    const beforeBody = before.body as StatsOverviewBody;

    // Tenant A : DRAFT -> TRIAL -> ACTIVE (conversion), payé en espèces (revenu).
    const { tenant: tenantA } = await createTenant("StatsTenantA");
    createdTenantIds.push(tenantA.id);
    const subscriptionA = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenantA.id },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscriptionA.id, "TRIAL");
    await subscriptionService.transitionSubscription(subscriptionA.id, "ACTIVE");

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscriptionA.id,
      currencyIsoCode: "XAF",
      billingName: "Stats School A",
      billingEmail: "stats-a@test.example",
    });
    const intent = await paymentService.createPaymentIntent({
      invoiceId: invoice.id,
      providerCode: "CASH_AGENT",
    });
    await paymentService.recordManualCashPayment({ paymentIntentId: intent.id });

    // Tenant B : DRAFT -> TRIAL -> ACTIVE -> CANCELLED (résiliation).
    const { tenant: tenantB } = await createTenant("StatsTenantB");
    createdTenantIds.push(tenantB.id);
    const subscriptionB = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenantB.id },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscriptionB.id, "TRIAL");
    await subscriptionService.transitionSubscription(subscriptionB.id, "ACTIVE");
    await subscriptionService.transitionSubscription(subscriptionB.id, "CANCELLED", { reason: "Test" });

    // Un lot de 2 licences sponsorisées par le tenant A, dont une attribuée.
    const parentBeneficiary = await createUser("stats-license-beneficiary");
    createdUserIds.push(parentBeneficiary.id);
    const plan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "SCHOOL_ESSENTIAL" },
    });
    const currency = await testAdminPrisma.currency.findUniqueOrThrow({ where: { isoCode: "XAF" } });
    const actor = { actorUserId: superAdmin.id, justification: "" };

    const batch = await licenseAdminService.createLicenseBatch(
      {
        planId: plan.id,
        purchaserType: "TENANT",
        sponsorTenantId: tenantA.id,
        quantity: 2,
        unitPriceCents: 1000,
        currencyId: currency.id,
      },
      actor,
    );
    createdBatchIds.push(batch.id);

    await licenseAdminService.assignLicense(
      batch.licenses[0]?.id as string,
      {
        beneficiaryType: "PARENT",
        beneficiaryUserId: parentBeneficiary.id,
        subscriptionId: subscriptionA.id,
      },
      actor,
    );

    const after = await request(app)
      .get("/api/v1/platform/stats/overview")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(after.status).toBe(200);
    const afterBody = after.body as StatsOverviewBody;

    expect(afterBody.tenants.total).toBeGreaterThanOrEqual(beforeBody.tenants.total + 2);
    expect(afterBody.tenants.byStatus.ACTIVE).toBeGreaterThanOrEqual(
      (beforeBody.tenants.byStatus.ACTIVE ?? 0) + 2,
    );

    expect(afterBody.subscriptions.total).toBeGreaterThanOrEqual(beforeBody.subscriptions.total + 2);
    expect(afterBody.subscriptions.byOwnerType.SCHOOL).toBeGreaterThanOrEqual(
      (beforeBody.subscriptions.byOwnerType.SCHOOL ?? 0) + 2,
    );
    expect(afterBody.subscriptions.byStatus.ACTIVE).toBeGreaterThanOrEqual(
      (beforeBody.subscriptions.byStatus.ACTIVE ?? 0) + 1,
    );
    expect(afterBody.subscriptions.byStatus.CANCELLED).toBeGreaterThanOrEqual(
      (beforeBody.subscriptions.byStatus.CANCELLED ?? 0) + 1,
    );

    expect(afterBody.licenses.total).toBeGreaterThanOrEqual(beforeBody.licenses.total + 2);
    expect(afterBody.licenses.available).toBeGreaterThanOrEqual(beforeBody.licenses.available + 1);
    expect(afterBody.licenses.assigned).toBeGreaterThanOrEqual(beforeBody.licenses.assigned + 1);

    const beforeXaf =
      beforeBody.revenue.byCurrency.find((bucket) => bucket.currencyIsoCode === "XAF")?.amountCents ?? 0;
    const afterXaf =
      afterBody.revenue.byCurrency.find((bucket) => bucket.currencyIsoCode === "XAF")?.amountCents ?? 0;
    expect(afterXaf).toBeGreaterThanOrEqual(beforeXaf + invoice.totalCents);

    expect(afterBody.conversionRate).not.toBeNull();
    expect(afterBody.conversionRate as number).toBeGreaterThan(0);
    expect(afterBody.conversionRate as number).toBeLessThanOrEqual(1);
    expect(afterBody.churnRate).not.toBeNull();
    expect(afterBody.churnRate as number).toBeGreaterThan(0);
    expect(afterBody.churnRate as number).toBeLessThanOrEqual(1);
  }, 20000);
});
