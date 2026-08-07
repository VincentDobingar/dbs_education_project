import { afterAll, describe, expect, it } from "vitest";

import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant } from "../fixtures.js";

describe("subscription lifecycle service", () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
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
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function newTenantId(): Promise<string> {
    const { tenant } = await createTenant("Lifecycle");
    createdTenantIds.push(tenant.id);
    return tenant.id;
  }

  it("creates a DRAFT subscription and records the initial event", async () => {
    const tenantId = await newTenantId();

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });

    expect(subscription.status).toBe("DRAFT");

    const events = await testAdminPrisma.subscriptionEvent.findMany({
      where: { subscriptionId: subscription.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.toStatus).toBe("DRAFT");
  });

  it("rejects an invalid transition and leaves the subscription untouched", async () => {
    const tenantId = await newTenantId();
    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });

    await expect(subscriptionService.transitionSubscription(subscription.id, "ACTIVE")).rejects.toThrow(
      /Cannot transition subscription/,
    );

    const untouched = await testAdminPrisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(untouched.status).toBe("DRAFT");
  });

  it("recalculates entitlements as enabled when the subscription becomes active", async () => {
    const tenantId = await newTenantId();
    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });

    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");
    const active = await subscriptionService.transitionSubscription(subscription.id, "ACTIVE");

    expect(active.startsAt).not.toBeNull();

    const entitlement = await testAdminPrisma.entitlement.findUniqueOrThrow({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: "report_card.download" },
      },
    });
    expect(entitlement.isEnabled).toBe(true);
  });

  it("disables entitlements (without deleting the subscription) once expired", async () => {
    const tenantId = await newTenantId();
    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });

    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");
    await subscriptionService.transitionSubscription(subscription.id, "ACTIVE");
    const expired = await subscriptionService.transitionSubscription(subscription.id, "EXPIRED");

    expect(expired.endsAt).not.toBeNull();

    const entitlement = await testAdminPrisma.entitlement.findUniqueOrThrow({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: "report_card.download" },
      },
    });
    expect(entitlement.isEnabled).toBe(false);

    // §6 / §37: expiration must never delete data — the row is still there, just inactive.
    const stillThere = await testAdminPrisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(stillThere.id).toBe(subscription.id);
  });
});
