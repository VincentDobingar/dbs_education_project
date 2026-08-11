import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("dépenses et caisse (§23)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.expense.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.expenseCategory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.cashSession.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    agentToken: string;
    noEmployeeToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("ExpenseTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("exp-agent");
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

    const noEmployeeOwner = await createUser("exp-no-employee");
    await addMembership(noEmployeeOwner.id, tenant.id);
    await grantRole(noEmployeeOwner.id, "SCHOOL_OWNER", tenant.id);
    const noEmployeeToken = signAccessToken({ sub: noEmployeeOwner.id });

    const teacher = await createUser("exp-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    return { subdomain, agentToken, noEmployeeToken, teacherToken };
  }

  it("manages expense categories and expenses, guarding permissions and duplicate codes", async () => {
    const { subdomain, agentToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: "SUPPLIES", nameFr: "Fournitures", nameEn: "Supplies" });
    expect(denied.status).toBe(403);

    const code = `SUPPLIES-${uniqueSuffix()}`;
    const category = await request(app)
      .post("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Fournitures", nameEn: "Supplies" });
    expect(category.status).toBe(201);
    const categoryId = (category.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Autre", nameEn: "Other" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("EXPENSE_CATEGORY_CODE_TAKEN");

    const listedCategories = await request(app)
      .get("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedCategories.status).toBe(200);
    expect((listedCategories.body as { id: string }[]).some((c) => c.id === categoryId)).toBe(true);

    const missingCategory = await request(app)
      .post("/api/v1/finance/expenses")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        categoryId: "does-not-exist",
        description: "Papier A4",
        amountCents: 15_000,
        expenseDate: "2026-02-01",
      });
    expect(missingCategory.status).toBe(404);
    expect((missingCategory.body as { code: string }).code).toBe("EXPENSE_CATEGORY_NOT_FOUND");

    const expense = await request(app)
      .post("/api/v1/finance/expenses")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        categoryId,
        supplierName: "Papeterie Centrale",
        description: "Papier A4",
        amountCents: 15_000,
        expenseDate: "2026-02-01",
      });
    expect(expense.status).toBe(201);
    const expenseId = (expense.body as { id: string }).id;

    const updated = await request(app)
      .patch(`/api/v1/finance/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 18_000 });
    expect(updated.status).toBe(200);
    expect((updated.body as { amountCents: number }).amountCents).toBe(18_000);

    const listed = await request(app)
      .get(`/api/v1/finance/expenses?categoryId=${categoryId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((e) => e.id === expenseId)).toBe(true);

    const removed = await request(app)
      .delete(`/api/v1/finance/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removed.status).toBe(204);

    const listedAfterRemoval = await request(app)
      .get(`/api/v1/finance/expenses?categoryId=${categoryId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedAfterRemoval.body as { id: string }[]).some((e) => e.id === expenseId)).toBe(false);

    const removeAgain = await request(app)
      .delete(`/api/v1/finance/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removeAgain.status).toBe(404);
  });

  it("opens and closes a cash session, guarding the employee requirement and single-open rule", async () => {
    const { subdomain, agentToken, noEmployeeToken } = await setUpTenant();

    const deniedByEmployeeRequirement = await request(app)
      .post("/api/v1/finance/cash-sessions/open")
      .set("Authorization", `Bearer ${noEmployeeToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ openingBalanceCents: 50_000 });
    expect(deniedByEmployeeRequirement.status).toBe(403);
    expect((deniedByEmployeeRequirement.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");

    const opened = await request(app)
      .post("/api/v1/finance/cash-sessions/open")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ openingBalanceCents: 50_000 });
    expect(opened.status).toBe(201);
    expect((opened.body as { status: string }).status).toBe("OPEN");
    const sessionId = (opened.body as { id: string }).id;

    const alreadyOpen = await request(app)
      .post("/api/v1/finance/cash-sessions/open")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ openingBalanceCents: 20_000 });
    expect(alreadyOpen.status).toBe(409);
    expect((alreadyOpen.body as { code: string }).code).toBe("CASH_SESSION_ALREADY_OPEN");

    const fetched = await request(app)
      .get(`/api/v1/finance/cash-sessions/${sessionId}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);

    const listedOpen = await request(app)
      .get("/api/v1/finance/cash-sessions?status=OPEN")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedOpen.status).toBe(200);
    expect((listedOpen.body as { id: string }[]).some((s) => s.id === sessionId)).toBe(true);

    const closed = await request(app)
      .post(`/api/v1/finance/cash-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ closingBalanceCents: 65_000 });
    expect(closed.status).toBe(200);
    expect((closed.body as { status: string }).status).toBe("CLOSED");

    const closeAgain = await request(app)
      .post(`/api/v1/finance/cash-sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ closingBalanceCents: 65_000 });
    expect(closeAgain.status).toBe(409);
    expect((closeAgain.body as { code: string }).code).toBe("CASH_SESSION_ALREADY_CLOSED");

    const reopened = await request(app)
      .post("/api/v1/finance/cash-sessions/open")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ openingBalanceCents: 65_000 });
    expect(reopened.status).toBe(201);
  });
});
