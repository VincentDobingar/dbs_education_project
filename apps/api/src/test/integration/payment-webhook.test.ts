import { createHmac } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { HmacSignedProviderAdapter } from "../../modules/payments/payment-providers/hmac-signed-provider.js";
import { registerPaymentProviderAdapter } from "../../modules/payments/payment-providers/registry.js";
import * as paymentService from "../../modules/payments/payment.service.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, uniqueSuffix } from "../fixtures.js";

const TEST_PROVIDER_CODE = "TEST_HMAC_PROVIDER";
const TEST_SECRET = "test-webhook-secret";

registerPaymentProviderAdapter(new HmacSignedProviderAdapter(TEST_PROVIDER_CODE, TEST_SECRET));

function sign(rawBody: string): string {
  return createHmac("sha256", TEST_SECRET).update(rawBody).digest("hex");
}

describe("payment webhook (signature verification + idempotency)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    await testAdminPrisma.paymentProvider.upsert({
      where: { code: TEST_PROVIDER_CODE },
      update: { isActive: true },
      create: {
        code: TEST_PROVIDER_CODE,
        nameFr: "Fournisseur de test",
        nameEn: "Test provider",
        methodType: "MOBILE_MONEY",
        isTestMode: true,
      },
    });
  });

  afterAll(async () => {
    await testAdminPrisma.receipt.deleteMany({
      where: {
        paymentTransaction: {
          paymentIntent: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
        },
      },
    });
    await testAdminPrisma.paymentWebhookEvent.deleteMany({
      where: { provider: { code: TEST_PROVIDER_CODE } },
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

  async function setupIntent() {
    const { tenant } = await createTenant("Webhook");
    createdTenantIds.push(tenant.id);

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenant.id },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
    });
    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Webhook School",
      billingEmail: "billing-webhook@test.example",
    });

    const idempotencyKey = `webhook-${uniqueSuffix()}`;
    const intent = await paymentService.createPaymentIntent({
      invoiceId: invoice.id,
      providerCode: TEST_PROVIDER_CODE,
      idempotencyKey,
    });

    return { subscription, invoice, intent };
  }

  it("activates the subscription on a validly signed webhook", async () => {
    const { subscription, invoice, intent } = await setupIntent();

    const payload = JSON.stringify({
      eventId: `evt-${uniqueSuffix()}`,
      reference: `ref-${uniqueSuffix()}`,
      merchantReference: intent.idempotencyKey,
      status: "success",
      amountCents: invoice.totalCents,
    });

    const response = await request(app)
      .post(`/api/v1/payments/webhooks/${TEST_PROVIDER_CODE}`)
      .set("Content-Type", "application/json")
      .set("x-signature", sign(payload))
      .send(payload);

    expect(response.status).toBe(200);

    const updatedSubscription = await testAdminPrisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(updatedSubscription.status).toBe("ACTIVE");
  });

  it("rejects a webhook with an invalid signature and does not process it", async () => {
    const { intent } = await setupIntent();

    const payload = JSON.stringify({
      eventId: `evt-${uniqueSuffix()}`,
      reference: `ref-${uniqueSuffix()}`,
      merchantReference: intent.idempotencyKey,
      status: "success",
      amountCents: 1,
    });

    const response = await request(app)
      .post(`/api/v1/payments/webhooks/${TEST_PROVIDER_CODE}`)
      .set("Content-Type", "application/json")
      .set("x-signature", "not-the-right-signature")
      .send(payload);

    expect(response.status).toBe(401);

    const transactionCount = await testAdminPrisma.paymentTransaction.count({
      where: { paymentIntentId: intent.id },
    });
    expect(transactionCount).toBe(0);
  });

  it("processes a duplicate delivery of the same event exactly once", async () => {
    const { invoice, intent } = await setupIntent();

    const payload = JSON.stringify({
      eventId: `evt-${uniqueSuffix()}`,
      reference: `ref-${uniqueSuffix()}`,
      merchantReference: intent.idempotencyKey,
      status: "success",
      amountCents: invoice.totalCents,
    });
    const signature = sign(payload);

    const first = await request(app)
      .post(`/api/v1/payments/webhooks/${TEST_PROVIDER_CODE}`)
      .set("Content-Type", "application/json")
      .set("x-signature", signature)
      .send(payload);
    const second = await request(app)
      .post(`/api/v1/payments/webhooks/${TEST_PROVIDER_CODE}`)
      .set("Content-Type", "application/json")
      .set("x-signature", signature)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const transactionCount = await testAdminPrisma.paymentTransaction.count({
      where: { paymentIntentId: intent.id },
    });
    expect(transactionCount).toBe(1);

    const receiptCount = await testAdminPrisma.receipt.count({
      where: { paymentTransaction: { paymentIntentId: intent.id } },
    });
    expect(receiptCount).toBe(1);
  });
});
