import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import * as paymentService from "../../modules/payments/payment.service.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";
import type { TestResponseBody } from "../test-app.js";

describe("cash payment flow (subscription -> invoice -> intent -> cash -> active)", () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
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
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function newTenantId(): Promise<string> {
    const { tenant } = await createTenant("CashFlow");
    createdTenantIds.push(tenant.id);
    return tenant.id;
  }

  it("activates the subscription and issues exactly one receipt, even if recorded twice", async () => {
    const tenantId = await newTenantId();

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Test School",
      billingEmail: "billing@test.example",
    });

    const intent = await paymentService.createPaymentIntent({
      invoiceId: invoice.id,
      providerCode: "CASH_AGENT",
    });

    const firstTransaction = await paymentService.recordManualCashPayment({ paymentIntentId: intent.id });
    const secondTransaction = await paymentService.recordManualCashPayment({ paymentIntentId: intent.id });

    expect(firstTransaction.id).toBe(secondTransaction.id);

    const transactionCount = await testAdminPrisma.paymentTransaction.count({
      where: { paymentIntentId: intent.id },
    });
    expect(transactionCount).toBe(1);

    const receiptCount = await testAdminPrisma.receipt.count({
      where: { paymentTransactionId: firstTransaction.id },
    });
    expect(receiptCount).toBe(1);

    const paidInvoice = await testAdminPrisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paidInvoice.status).toBe("PAID");

    const activeSubscription = await testAdminPrisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(activeSubscription.status).toBe("ACTIVE");
  });

  it("refuses to pay another tenant's invoice, even with a correct staff session", async () => {
    const app = createApp();

    const tenantAId = await newTenantId();
    const tenantBId = await newTenantId();

    const subscriptionB = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenantBId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscriptionB.id, "PENDING_PAYMENT");
    const invoiceB = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscriptionB.id,
      currencyIsoCode: "XAF",
      billingName: "School B",
      billingEmail: "billing-b@test.example",
    });

    const ownerA = await createUser("owner-a");
    await addMembership(ownerA.id, tenantAId);
    await grantRole(ownerA.id, "SCHOOL_OWNER", tenantAId);
    const tokenA = signAccessToken({ sub: ownerA.id });

    const domainA = await testAdminPrisma.tenantDomain.findFirstOrThrow({ where: { tenantId: tenantAId } });

    // Tenant A needs its own subscription — requireTenantSubscription() must find
    // one before assertInvoiceBelongsToSubscription() even gets a chance to run.
    await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenantAId },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });

    const response = await request(app)
      .post("/api/v1/subscriptions/school/payment-intent")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Tenant-Slug", domainA.subdomain)
      .send({ invoiceId: invoiceB.id, providerCode: "CASH_AGENT" });

    expect(response.status).toBe(404);
    expect((response.body as TestResponseBody).code).toBe("INVOICE_NOT_FOUND");
  });
});
