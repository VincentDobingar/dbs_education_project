import { afterAll, describe, expect, it } from "vitest";

import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createTenant } from "../fixtures.js";

describe("subscription lifecycle service", () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    const ownerFilter = {
      OR: [{ tenantId: { in: createdTenantIds } }, { student: { tenantId: { in: createdTenantIds } } }],
    };
    await testAdminPrisma.entitlement.deleteMany({ where: { subscription: { owner: ownerFilter } } });
    await testAdminPrisma.subscriptionEvent.deleteMany({ where: { subscription: { owner: ownerFilter } } });
    await testAdminPrisma.subscription.deleteMany({ where: { owner: ownerFilter } });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: ownerFilter });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

  // §6 : « la période de grâce doit offrir un accès limité » — jusqu'ici GRACE_PERIOD
  // se comportait exactement comme ACTIVE. STUDENT_BASIC est le premier plan de ce
  // fichier dont report_card.download porte un quota réel (12, contre illimité pour
  // les plans SCHOOL_*) — le seul terrain où « gelé » et « inchangé » se distinguent.
  it("freezes a quota-limited entitlement to zero during grace period, without disabling the feature", async () => {
    const tenantId = await newTenantId();
    const student = await createStudent(tenantId, "GRACE");

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "STUDENT",
      ownerRef: { studentId: student.id },
      planCode: "STUDENT_BASIC",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");
    await subscriptionService.transitionSubscription(subscription.id, "ACTIVE");

    const activeEntitlement = await testAdminPrisma.entitlement.findUniqueOrThrow({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: "report_card.download" },
      },
    });
    expect(activeEntitlement.isEnabled).toBe(true);
    expect(activeEntitlement.quotaLimit).toBe(12);

    await subscriptionService.transitionSubscription(subscription.id, "PAST_DUE");
    await subscriptionService.transitionSubscription(subscription.id, "GRACE_PERIOD");

    const graceEntitlement = await testAdminPrisma.entitlement.findUniqueOrThrow({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: "report_card.download" },
      },
    });
    // Toujours incluse au plan (jamais retirée), mais plus aucune nouvelle consommation.
    expect(graceEntitlement.isEnabled).toBe(true);
    expect(graceEntitlement.quotaLimit).toBe(0);

    const backToActive = await subscriptionService.transitionSubscription(subscription.id, "ACTIVE");
    expect(backToActive.status).toBe("ACTIVE");
    const restoredEntitlement = await testAdminPrisma.entitlement.findUniqueOrThrow({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: "report_card.download" },
      },
    });
    expect(restoredEntitlement.quotaLimit).toBe(12);
  });

  // §6 : jusqu'ici rien ne faisait avancer un abonnement dans le temps (docs/architecture.md,
  // chantier laissé ouvert par cd66269) — `applySubscriptionTransition` calcule désormais
  // `currentPeriodEndsAt`/`graceEndsAt`, et `advanceSubscriptionIfDue` est le mécanisme qui les
  // consulte pour faire progresser un abonnement que personne n'a fait bouger manuellement.
  describe("advanceSubscriptionIfDue", () => {
    async function backdate(
      subscriptionId: string,
      field: "currentPeriodEndsAt" | "graceEndsAt" | "trialEndsAt",
    ) {
      return testAdminPrisma.subscription.update({
        where: { id: subscriptionId },
        data: { [field]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
    }

    it("stamps currentPeriodEndsAt from the plan's billing period on activation", async () => {
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

      expect(active.currentPeriodEndsAt).not.toBeNull();
      expect(active.currentPeriodEndsAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("leaves an ACTIVE subscription untouched while its current period has not ended", async () => {
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

      const advanced = await subscriptionService.advanceSubscriptionIfDue(active);
      expect(advanced.status).toBe("ACTIVE");
    });

    it("moves a lapsed ACTIVE subscription into GRACE_PERIOD when its plan grants one", async () => {
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
      const lapsed = await backdate(subscription.id, "currentPeriodEndsAt");

      const advanced = await subscriptionService.advanceSubscriptionIfDue(lapsed);
      expect(advanced.status).toBe("GRACE_PERIOD");
      expect(advanced.graceEndsAt).not.toBeNull();
      expect(advanced.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("expires a lapsed ACTIVE subscription directly when its plan has no grace period", async () => {
      const tenantId = await newTenantId();
      const subscription = await subscriptionService.createDraftSubscription({
        ownerType: "SCHOOL",
        ownerRef: { tenantId },
        planCode: "SCHOOL_BULK_LICENSE",
        fundingSource: "SELF_PAID",
        billingPeriod: "MONTHLY",
      });
      await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");
      await subscriptionService.transitionSubscription(subscription.id, "ACTIVE");
      const lapsed = await backdate(subscription.id, "currentPeriodEndsAt");

      const advanced = await subscriptionService.advanceSubscriptionIfDue(lapsed);
      expect(advanced.status).toBe("EXPIRED");
    });

    it("expires a GRACE_PERIOD subscription once graceEndsAt has passed", async () => {
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
      await subscriptionService.transitionSubscription(subscription.id, "PAST_DUE");
      await subscriptionService.transitionSubscription(subscription.id, "GRACE_PERIOD");
      const lapsed = await backdate(subscription.id, "graceEndsAt");

      const advanced = await subscriptionService.advanceSubscriptionIfDue(lapsed);
      expect(advanced.status).toBe("EXPIRED");
    });

    it("expires a TRIAL subscription once trialEndsAt has passed", async () => {
      const tenantId = await newTenantId();
      const subscription = await subscriptionService.createDraftSubscription({
        ownerType: "SCHOOL",
        ownerRef: { tenantId },
        planCode: "SCHOOL_ESSENTIAL",
        fundingSource: "SELF_PAID",
        billingPeriod: "MONTHLY",
      });
      await subscriptionService.transitionSubscription(subscription.id, "TRIAL");
      const lapsed = await backdate(subscription.id, "trialEndsAt");

      const advanced = await subscriptionService.advanceSubscriptionIfDue(lapsed);
      expect(advanced.status).toBe("EXPIRED");
    });
  });
});
