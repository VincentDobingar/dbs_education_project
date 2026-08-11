import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("module financier de l'établissement (§23)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.feeStructure.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.feeCategory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenantWithAdmin(): Promise<{
    subdomain: string;
    adminToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("FinanceTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("fin-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("fin-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("lets a SCHOOL_OWNER manage fee categories, but refuses a TEACHER; guards duplicate codes", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();

    const denied = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: "TUITION", nameFr: "Scolarité", nameEn: "Tuition" });
    expect(denied.status).toBe(403);

    const code = `TUITION-${uniqueSuffix()}`;
    const created = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Scolarité", nameEn: "Tuition" });
    expect(created.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Autre", nameEn: "Other" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("FEE_CATEGORY_CODE_TAKEN");
  });

  it("builds a tariff grid, then a student invoice with discounted line items, and runs its lifecycle", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const academicYearId = (year.body as { id: string }).id;

    const cycle = await request(app)
      .post("/api/v1/school-config/education-cycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `CYC-${uniqueSuffix()}`, nameFr: "Collège", nameEn: "Middle school", order: 1 });

    const gradeLevel = await request(app)
      .post(`/api/v1/school-config/education-cycles/${(cycle.body as { id: string }).id}/grade-levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `6EME-${uniqueSuffix()}`, nameFr: "6ème", nameEn: "Grade 6", order: 1 });
    const gradeLevelId = (gradeLevel.body as { id: string }).id;

    const category = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `TUITION-${uniqueSuffix()}`, nameFr: "Scolarité", nameEn: "Tuition" });
    const feeCategoryId = (category.body as { id: string }).id;

    const structure = await request(app)
      .post("/api/v1/finance/fee-structures")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, gradeLevelId, feeCategoryId, amountCents: 150_000 });
    expect(structure.status).toBe(201);
    const feeStructureId = (structure.body as { id: string }).id;

    const listedStructures = await request(app)
      .get(`/api/v1/finance/fee-structures?academicYearId=${academicYearId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedStructures.status).toBe(200);
    expect((listedStructures.body as unknown[]).length).toBe(1);

    const updatedStructure = await request(app)
      .patch(`/api/v1/finance/fee-structures/${feeStructureId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 140_000 });
    expect(updatedStructure.status).toBe(200);
    expect((updatedStructure.body as { amountCents: number }).amountCents).toBe(140_000);

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Awa", lastName: "Ngo" });
    const studentId = (student.body as { id: string }).id;

    const invalidDiscount = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId,
        academicYearId,
        items: [{ feeStructureId, description: "Scolarité", amountCents: 140_000, discountCents: 200_000 }],
      });
    expect(invalidDiscount.status).toBe(400);

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId,
        academicYearId,
        items: [
          { feeStructureId, description: "Scolarité", amountCents: 140_000, discountCents: 15_000 },
          { description: "Frais d'inscription", amountCents: 10_000 },
        ],
      });
    expect(invoice.status).toBe(201);
    const invoiceId = (invoice.body as { id: string }).id;
    // (140000 - 15000) + (10000 - 0) = 135000
    expect((invoice.body as { totalCents: number }).totalCents).toBe(135_000);
    expect((invoice.body as { status: string }).status).toBe("DRAFT");
    expect((invoice.body as { items: unknown[] }).items.length).toBe(2);

    const fetched = await request(app)
      .get(`/api/v1/finance/student-invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);

    const issued = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(issued.status).toBe(200);
    expect((issued.body as { status: string }).status).toBe("ISSUED");

    const reissued = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(reissued.status).toBe(409);

    const listed = await request(app)
      .get(`/api/v1/finance/student-invoices?studentId=${studentId}&status=ISSUED`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((i) => i.id === invoiceId)).toBe(true);

    const cancelled = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { status: string }).status).toBe("CANCELLED");

    const cancelAgain = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelAgain.status).toBe(409);
    expect((cancelAgain.body as { code: string }).code).toBe("INVOICE_ALREADY_CANCELLED");
  });
});
