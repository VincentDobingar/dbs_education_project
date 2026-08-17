import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("rapports de recettes et de dépenses (§23)", () => {
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
    await testAdminPrisma.expense.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.expenseCategory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{ subdomain: string; agentToken: string; teacherToken: string }> {
    const { tenant, subdomain } = await createTenant("ReportTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("report-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    const teacher = await createUser("report-teacher");
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

    return { subdomain, agentToken, teacherToken };
  }

  it("agrège les recettes du jour par mode de paiement, net des remboursements — CSV/PDF/permissions", async () => {
    const { subdomain, agentToken, teacherToken } = await setUpTenant();

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
      .send({ amountCents: 60_000 });
    const paymentId = (payment.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 10_000, reason: "Trop-perçu" });

    const today = new Date().toISOString().slice(0, 10);

    const deniedForTeacher = await request(app)
      .get(`/api/v1/finance/reports/revenue?startDate=${today}&endDate=${today}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(deniedForTeacher.status).toBe(403);

    const missingDates = await request(app)
      .get("/api/v1/finance/reports/revenue")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(missingDates.status).toBe(400);

    const invalidRange = await request(app)
      .get(`/api/v1/finance/reports/revenue?startDate=${today}&endDate=2020-01-01`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(invalidRange.status).toBe(400);

    const report = await request(app)
      .get(`/api/v1/finance/reports/revenue?startDate=${today}&endDate=${today}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(report.status).toBe(200);
    const body = report.body as {
      paymentCount: number;
      grossRevenueCents: number;
      refundedCents: number;
      netRevenueCents: number;
      byMethod: { key: string; amountCents: number }[];
      byDay: { key: string; amountCents: number }[];
    };
    expect(body.paymentCount).toBe(1);
    expect(body.grossRevenueCents).toBe(60_000);
    expect(body.refundedCents).toBe(10_000);
    expect(body.netRevenueCents).toBe(50_000);
    expect(body.byMethod).toEqual([{ key: "CASH", label: "CASH", amountCents: 60_000 }]);
    expect(body.byDay).toEqual([{ key: today, label: today, amountCents: 60_000 }]);

    const csv = await request(app)
      .get(`/api/v1/finance/reports/revenue/csv?startDate=${today}&endDate=${today}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("600.00");
    expect(csv.text).toContain("100.00");

    const pdf = await request(app)
      .get(`/api/v1/finance/reports/revenue/pdf?startDate=${today}&endDate=${today}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  }, 20000);

  it("agrège les dépenses par catégorie et par jour, bornées à la période demandée", async () => {
    const { subdomain, agentToken } = await setUpTenant();

    const category = await request(app)
      .post("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `SUPPLIES-${uniqueSuffix()}`, nameFr: "Fournitures", nameEn: "Supplies" });
    const categoryId = (category.body as { id: string }).id;

    await request(app)
      .post("/api/v1/finance/expenses")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ categoryId, description: "Papier A4", amountCents: 15_000, expenseDate: "2026-02-01" });

    await request(app)
      .post("/api/v1/finance/expenses")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ categoryId, description: "Encre", amountCents: 25_000, expenseDate: "2026-02-02" });

    const fullRange = await request(app)
      .get("/api/v1/finance/reports/expenses?startDate=2026-02-01&endDate=2026-02-02")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fullRange.status).toBe(200);
    const fullBody = fullRange.body as {
      expenseCount: number;
      totalExpensesCents: number;
      byCategory: { key: string; label: string; amountCents: number }[];
      byDay: { key: string; amountCents: number }[];
    };
    expect(fullBody.expenseCount).toBe(2);
    expect(fullBody.totalExpensesCents).toBe(40_000);
    expect(fullBody.byCategory).toEqual([{ key: categoryId, label: "Fournitures", amountCents: 40_000 }]);
    expect(fullBody.byDay).toEqual([
      { key: "2026-02-01", label: "2026-02-01", amountCents: 15_000 },
      { key: "2026-02-02", label: "2026-02-02", amountCents: 25_000 },
    ]);

    const narrowRange = await request(app)
      .get("/api/v1/finance/reports/expenses?startDate=2026-02-01&endDate=2026-02-01")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((narrowRange.body as { totalExpensesCents: number }).totalExpensesCents).toBe(15_000);

    const csv = await request(app)
      .get("/api/v1/finance/reports/expenses/csv?startDate=2026-02-01&endDate=2026-02-02")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("400.00");

    const pdf = await request(app)
      .get("/api/v1/finance/reports/expenses/pdf?startDate=2026-02-01&endDate=2026-02-02")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  }, 20000);
});
