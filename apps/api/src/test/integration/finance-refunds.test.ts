import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("remboursements et situation financière (§23)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentPaymentRefund.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("rembourse partiellement puis totalement un paiement, et débloque l'annulation de la facture", async () => {
    const { tenant, subdomain } = await createTenant("RefundTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("refund-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    const noEmployeeOwner = await createUser("refund-no-employee");
    await addMembership(noEmployeeOwner.id, tenant.id);
    await grantRole(noEmployeeOwner.id, "SCHOOL_OWNER", tenant.id);
    const noEmployeeToken = signAccessToken({ sub: noEmployeeOwner.id });

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
      .send({
        studentId,
        academicYearId,
        items: [{ description: "Scolarité annuelle", amountCents: 100_000 }],
      });
    const invoiceId = (invoice.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const payment = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 100_000 });
    expect(payment.status).toBe(201);
    const paymentId = (payment.body as { id: string }).id;

    const cancelBeforeRefund = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelBeforeRefund.status).toBe(409);
    expect((cancelBeforeRefund.body as { code: string }).code).toBe("INVOICE_HAS_PAYMENTS");

    const tooMuch = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 150_000, reason: "Trop-perçu" });
    expect(tooMuch.status).toBe(400);
    expect((tooMuch.body as { code: string }).code).toBe("REFUND_EXCEEDS_PAYMENT");

    const deniedNoEmployee = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${noEmployeeToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 20_000, reason: "Erreur de saisie" });
    expect(deniedNoEmployee.status).toBe(403);
    expect((deniedNoEmployee.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");

    const partialRefund = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 30_000, reason: "Trop-perçu" });
    expect(partialRefund.status).toBe(201);

    const invoiceAfterPartial = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((invoiceAfterPartial.body as { status: string }).status).toBe("PARTIALLY_PAID");
    expect((invoiceAfterPartial.body as { paidCents: number }).paidCents).toBe(70_000);

    const refunds = await request(app)
      .get(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(refunds.status).toBe(200);
    expect((refunds.body as unknown[]).length).toBe(1);

    const remainderTooMuch = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 80_000, reason: "Second remboursement" });
    expect(remainderTooMuch.status).toBe(400);

    const finalRefund = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 70_000, reason: "Remboursement intégral" });
    expect(finalRefund.status).toBe(201);

    const invoiceAfterFullRefund = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((invoiceAfterFullRefund.body as { status: string }).status).toBe("ISSUED");
    expect((invoiceAfterFullRefund.body as { paidCents: number }).paidCents).toBe(0);

    const cancelAfterRefund = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelAfterRefund.status).toBe(200);
    expect((cancelAfterRefund.body as { status: string }).status).toBe("CANCELLED");

    // requireReceipt (student-payment.service.ts) ne consultait jamais
    // StudentPaymentRefund -- le reçu d'un paiement intégralement remboursé restait
    // indiscernable d'un paiement toujours valide (JSON et PDF, y compris côté
    // portails parent/élève).
    const receiptId = (payment.body as { receipt: { id: string } }).receipt.id;
    const receiptAfterFullRefund = await request(app)
      .get(`/api/v1/finance/receipts/${receiptId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(receiptAfterFullRefund.status).toBe(200);
    expect((receiptAfterFullRefund.body as { refundedCents: number }).refundedCents).toBe(100_000);

    const receiptPdfAfterFullRefund = await request(app)
      .get(`/api/v1/finance/receipts/${receiptId}/pdf`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(receiptPdfAfterFullRefund.status).toBe(200);
  }, 20000);

  it("calcule la situation financière consolidée et les impayés d'un élève", async () => {
    const { tenant, subdomain } = await createTenant("SituationTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("situation-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

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
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Boris", lastName: "Ekani" });
    const studentId = (student.body as { id: string }).id;

    const overdueInvoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId,
        academicYearId,
        dueAt: "2020-01-01",
        items: [{ description: "Frais d'inscription", amountCents: 20_000 }],
      });
    await request(app)
      .post(`/api/v1/finance/student-invoices/${(overdueInvoice.body as { id: string }).id}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const futureInvoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId,
        academicYearId,
        dueAt: "2030-01-01",
        items: [{ description: "Scolarité", amountCents: 50_000 }],
      });
    await request(app)
      .post(`/api/v1/finance/student-invoices/${(futureInvoice.body as { id: string }).id}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const situation = await request(app)
      .get(`/api/v1/finance/students/${studentId}/financial-situation`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(situation.status).toBe(200);
    const body = situation.body as {
      totalInvoicedCents: number;
      totalPaidCents: number;
      outstandingCents: number;
      overdueInvoices: { id: string }[];
      invoices: unknown[];
    };
    expect(body.totalInvoicedCents).toBe(70_000);
    expect(body.totalPaidCents).toBe(0);
    expect(body.outstandingCents).toBe(70_000);
    expect(body.overdueInvoices.length).toBe(1);
    expect(body.overdueInvoices[0]?.id).toBe((overdueInvoice.body as { id: string }).id);
    expect(body.invoices.length).toBe(2);
  });
});
