import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("encaissement et reçus (§23)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.feeCategory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("records full and partial cash payments transactionally, issues receipts, and guards balance/authorization", async () => {
    const { tenant, subdomain } = await createTenant("PaymentTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("pay-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    // A SCHOOL_OWNER with finance.write but no linked Employee record — has the
    // permission to record a payment, but the schema requires recordedByEmployeeId
    // for cash (§23), so this must still be refused.
    const noEmployeeOwner = await createUser("pay-no-employee");
    await addMembership(noEmployeeOwner.id, tenant.id);
    await grantRole(noEmployeeOwner.id, "SCHOOL_OWNER", tenant.id);
    const noEmployeeToken = signAccessToken({ sub: noEmployeeOwner.id });

    const teacher = await createUser("pay-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

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

    const paymentOnDraft = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000 });
    expect(paymentOnDraft.status).toBe(400);
    expect((paymentOnDraft.body as { code: string }).code).toBe("INVOICE_NOT_ISSUED");

    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const deniedByPermission = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000 });
    expect(deniedByPermission.status).toBe(403);

    const deniedByEmployeeRequirement = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${noEmployeeToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000 });
    expect(deniedByEmployeeRequirement.status).toBe(403);
    expect((deniedByEmployeeRequirement.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");

    const partial = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 60_000 });
    expect(partial.status).toBe(201);
    expect((partial.body as { receipt: { number: string } }).receipt.number).toBeTruthy();
    const firstReceiptId = (partial.body as { receipt: { id: string } }).receipt.id;

    const invoiceAfterPartial = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((invoiceAfterPartial.body as { status: string }).status).toBe("PARTIALLY_PAID");
    expect((invoiceAfterPartial.body as { paidCents: number }).paidCents).toBe(60_000);

    const overpay = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000 });
    expect(overpay.status).toBe(400);
    expect((overpay.body as { code: string }).code).toBe("AMOUNT_EXCEEDS_BALANCE");

    const final = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 40_000 });
    expect(final.status).toBe(201);

    const invoiceAfterFull = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((invoiceAfterFull.body as { status: string }).status).toBe("PAID");
    expect((invoiceAfterFull.body as { paidCents: number }).paidCents).toBe(100_000);

    const overpayAfterPaid = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 1 });
    expect(overpayAfterPaid.status).toBe(409);
    expect((overpayAfterPaid.body as { code: string }).code).toBe("INVOICE_ALREADY_PAID");

    const payments = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(payments.status).toBe(200);
    expect((payments.body as unknown[]).length).toBe(2);

    const receipt = await request(app)
      .get(`/api/v1/finance/receipts/${firstReceiptId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(receipt.status).toBe(200);

    const receiptPdf = await request(app)
      .get(`/api/v1/finance/receipts/${firstReceiptId}/pdf`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(receiptPdf.status).toBe(200);
    expect(receiptPdf.headers["content-type"]).toBe("application/pdf");

    const cancelPaidInvoice = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelPaidInvoice.status).toBe(409);
    expect((cancelPaidInvoice.body as { code: string }).code).toBe("INVOICE_HAS_PAYMENTS");
  }, 20000);

  // §27 : archiveEmployee pose deletedAt/status TERMINATED, mais rien ne le
  // consultait jusqu'ici — resolveActingEmployeeId (dupliqué dans dix services)
  // continuait de résoudre l'Employee d'un utilisateur licencié, qui pouvait donc
  // continuer d'encaisser des paiements sous son ancienne identité de personnel.
  it("refuses a cash payment once the recording employee has been archived, even with a valid session", async () => {
    const { tenant, subdomain } = await createTenant("PaymentTerminated");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("pay-terminated-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    const employee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Moussa",
        lastName: "Keita",
        jobTitle: "Agent comptable",
        userId: agent.id,
      });
    const employeeId = (employee.body as { id: string }).id;

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
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Salif", lastName: "Traore" });
    const studentId = (student.body as { id: string }).id;

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Scolarité", amountCents: 50_000 }] });
    const invoiceId = (invoice.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const beforeArchive = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 20_000 });
    expect(beforeArchive.status).toBe(201);

    const archived = await request(app)
      .post(`/api/v1/employees/${employeeId}/archive`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(archived.status).toBe(200);
    expect((archived.body as { status: string }).status).toBe("TERMINATED");

    // Same session, same permission (SCHOOL_OWNER never lost finance.write) — only
    // the Employee link behind it was retired. Must now be refused exactly like a
    // user who never had an Employee record at all.
    const afterArchive = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 10_000 });
    expect(afterArchive.status).toBe(403);
    expect((afterArchive.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");

    const invoiceAfter = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((invoiceAfter.body as { paidCents: number }).paidCents).toBe(20_000);
  }, 20000);
});
