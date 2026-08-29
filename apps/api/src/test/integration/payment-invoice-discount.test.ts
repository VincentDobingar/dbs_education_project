import { afterAll, describe, expect, it } from "vitest";

import * as paymentService from "../../modules/payments/payment.service.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, uniqueSuffix } from "../fixtures.js";

// §31 tranche 8 avait branché la consommation d'un PromotionCode (PromotionRedemption
// créée/comptée) sans jamais l'appliquer au montant facturé -- createInvoiceForSubscription
// facturait toujours le plein tarif. Ces tests couvrent le correctif : la remise doit
// se répercuter sur discountCents/totalCents et sur les lignes de la facture.
describe("invoice discount from a redeemed promotion code (§31 tranche 8, §40)", () => {
  const createdTenantIds: string[] = [];
  const createdPromotionCodeIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.promotionRedemption.deleteMany({
      where: { promotionCodeId: { in: createdPromotionCodeIds } },
    });
    await testAdminPrisma.promotionCode.deleteMany({ where: { id: { in: createdPromotionCodeIds } } });
    await testAdminPrisma.invoiceItem.deleteMany({
      where: { invoice: { subscription: { owner: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.invoice.deleteMany({
      where: { subscription: { owner: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.billingAccount.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
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

  async function createPromotionCode(overrides: Record<string, unknown> = {}) {
    const promotionCode = await testAdminPrisma.promotionCode.create({
      data: {
        code: `PROMO-${uniqueSuffix()}`,
        discountType: "PERCENTAGE",
        discountValue: 10,
        isActive: true,
        ...overrides,
      },
    });
    createdPromotionCodeIds.push(promotionCode.id);
    return promotionCode;
  }

  async function newSubscription(promoCode?: string) {
    const { tenant } = await createTenant("InvoiceDiscount");
    createdTenantIds.push(tenant.id);

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenant.id },
      planCode: "SCHOOL_ESSENTIAL",
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
      ...(promoCode ? { promoCode } : {}),
    });
    await subscriptionService.transitionSubscription(subscription.id, "PENDING_PAYMENT");
    return subscription;
  }

  it("applies a percentage discount, taxing only the discounted subtotal", async () => {
    const promotionCode = await createPromotionCode({ discountType: "PERCENTAGE", discountValue: 10 });
    const subscription = await newSubscription(promotionCode.code);

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Test School",
      billingEmail: "billing@test.example",
    });

    expect(invoice.subtotalCents).toBe(25_000);
    expect(invoice.discountCents).toBe(2_500);
    expect(invoice.taxCents).toBe(0);
    expect(invoice.totalCents).toBe(22_500);

    const items = await testAdminPrisma.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { totalAmountCents: "desc" },
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.totalAmountCents).toBe(25_000);
    expect(items[1]?.totalAmountCents).toBe(-2_500);
  });

  it("scales a fixed-amount discount by the currency's decimal digits", async () => {
    const promotionCode = await createPromotionCode({ discountType: "FIXED_AMOUNT", discountValue: 5_000 });
    const subscription = await newSubscription(promotionCode.code);

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Test School",
      billingEmail: "billing@test.example",
    });

    // XAF has decimalDigits=0, so a discountValue of 5000 is 5000 cents, not 500000.
    expect(invoice.discountCents).toBe(5_000);
    expect(invoice.totalCents).toBe(20_000);
  });

  it("caps the discount at the subtotal so the invoice can never go negative", async () => {
    const promotionCode = await createPromotionCode({ discountType: "FIXED_AMOUNT", discountValue: 999_999 });
    const subscription = await newSubscription(promotionCode.code);

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Test School",
      billingEmail: "billing@test.example",
    });

    expect(invoice.discountCents).toBe(25_000);
    expect(invoice.taxCents).toBe(0);
    expect(invoice.totalCents).toBe(0);
  });

  it("leaves the invoice at full price when no promotion code was redeemed", async () => {
    const subscription = await newSubscription();

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: "XAF",
      billingName: "Test School",
      billingEmail: "billing@test.example",
    });

    expect(invoice.discountCents).toBe(0);
    expect(invoice.totalCents).toBe(25_000);

    const items = await testAdminPrisma.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    expect(items).toHaveLength(1);
  });
});
