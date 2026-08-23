import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import * as paymentService from "../../modules/payments/payment.service.js";
import { generateReference } from "../../modules/payments/reference.js";
import type * as ReferenceModule from "../../modules/payments/reference.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

vi.mock("../../modules/payments/reference.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ReferenceModule>();
  return { generateReference: vi.fn(actual.generateReference) };
});

const mockedGenerateReference = vi.mocked(generateReference);

/**
 * §37 : « les transactions financières sont atomiques » — prouvé en forçant un échec
 * DANS la transaction (jamais avant/après) et en vérifiant qu'aucune écriture partielle
 * ne survit, plutôt qu'en ne vérifiant que le chemin heureux (déjà couvert ailleurs :
 * payment-cash-flow.test.ts, finance-payments.test.ts).
 */
describe("atomicité des transactions financières (§37)", () => {
  const app = createApp();
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
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("rolls back the SaaS cash-payment transaction in full when receipt issuance fails mid-transaction", async () => {
    const { tenant } = await createTenant("AtomicSaaS");
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
      billingName: "Atomic School",
      billingEmail: "atomic@test.example",
    });
    const intent = await paymentService.createPaymentIntent({
      invoiceId: invoice.id,
      providerCode: "CASH_AGENT",
    });

    // Laisse passer le premier appel (référence de la transaction "CASH"), échoue
    // seulement sur le second (référence du reçu "REC") — c'est la toute dernière
    // écriture de recordManualCashPayment, celle qui doit entraîner l'annulation de
    // tout ce qui l'a précédée dans la même transaction.
    mockedGenerateReference
      .mockImplementationOnce((prefix: string) => `${prefix}-real`)
      .mockImplementationOnce(() => {
        throw new Error("forced failure before receipt issuance");
      });

    await expect(paymentService.recordManualCashPayment({ paymentIntentId: intent.id })).rejects.toThrow(
      "forced failure before receipt issuance",
    );

    const transactionCount = await testAdminPrisma.paymentTransaction.count({
      where: { paymentIntentId: intent.id },
    });
    expect(transactionCount).toBe(0);

    const intentAfterFailure = await testAdminPrisma.paymentIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(intentAfterFailure.status).not.toBe("SUCCEEDED");

    const invoiceAfterFailure = await testAdminPrisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(invoiceAfterFailure.status).not.toBe("PAID");
    expect(invoiceAfterFailure.paidAt).toBeNull();

    const subscriptionAfterFailure = await testAdminPrisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(subscriptionAfterFailure.status).toBe("PENDING_PAYMENT");

    const receiptCount = await testAdminPrisma.receipt.count({
      where: { paymentTransaction: { paymentIntentId: intent.id } },
    });
    expect(receiptCount).toBe(0);

    // Le système se rétablit normalement une fois la panne levée — pas de verrou
    // orphelin laissé par la tentative échouée.
    mockedGenerateReference.mockImplementation((prefix: string) => `${prefix}-recovered`);
    const recovered = await paymentService.recordManualCashPayment({ paymentIntentId: intent.id });
    expect(recovered.status).toBe("SUCCEEDED");
    const recoveredInvoice = await testAdminPrisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(recoveredInvoice.status).toBe("PAID");
  });

  it("rolls back the school-fee cash-payment transaction in full when receipt issuance fails mid-transaction", async () => {
    const { tenant, subdomain } = await createTenant("AtomicSchoolFee");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("atomic-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Agent comptable",
        userId: agent.id,
      });

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const academicYearId = (year.body as { id: string }).id;

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Awa", lastName: "Ngo" });
    const studentId = (student.body as { id: string }).id;

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Scolarité", amountCents: 100_000 }] });
    const invoiceId = (invoice.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    // recordCashPayment n'appelle generateReference qu'une seule fois (le numéro du
    // reçu, toute dernière écriture) — le faire échouer prouve que le paiement et la
    // mise à jour du solde de la facture, déjà écrits avant dans la même transaction,
    // sont bien annulés avec lui.
    mockedGenerateReference.mockImplementationOnce(() => {
      throw new Error("forced failure before receipt issuance");
    });

    const failedPayment = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 60_000 });
    expect(failedPayment.status).toBe(500);

    const paymentCount = await testAdminPrisma.studentPayment.count({
      where: { studentInvoiceId: invoiceId },
    });
    expect(paymentCount).toBe(0);

    const invoiceAfterFailure = await testAdminPrisma.studentInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoiceAfterFailure.paidCents).toBe(0);
    expect(invoiceAfterFailure.status).toBe("ISSUED");

    const receiptCount = await testAdminPrisma.studentReceipt.count({
      where: { payment: { studentInvoiceId: invoiceId } },
    });
    expect(receiptCount).toBe(0);

    // Une fois la panne levée, l'encaissement fonctionne normalement.
    mockedGenerateReference.mockImplementation((prefix: string) => `${prefix}-recovered`);
    const recoveredPayment = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 60_000 });
    expect(recoveredPayment.status).toBe(201);
  });
});
