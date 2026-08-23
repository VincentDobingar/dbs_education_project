import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createStudent, createTenant, createUser, grantRole } from "../fixtures.js";

describe("cantine (§29)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.mealAttendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentMealEnrollment.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.mealPlan.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.menu.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    tenantId: string;
    ownerToken: string;
    managerToken: string;
    teacherToken: string;
    studentId: string;
  }> {
    const { tenant, subdomain } = await createTenant("CafeteriaTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("caf-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    // CAFETERIA_MANAGER est un nouveau role introduit par cette tranche — verifie
    // qu'il fonctionne reellement, pas seulement au seed.
    const manager = await createUser("caf-manager");
    await addMembership(manager.id, tenant.id);
    await grantRole(manager.id, "CAFETERIA_MANAGER", tenant.id);
    const managerToken = signAccessToken({ sub: manager.id });

    const teacher = await createUser("caf-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const student = await createStudent(tenant.id, "CAF");

    return {
      subdomain,
      tenantId: tenant.id,
      ownerToken,
      managerToken,
      teacherToken,
      studentId: student.id,
    };
  }

  it("lets a CAFETERIA_MANAGER manage the menu, refuses a TEACHER, and rejects a duplicate day", async () => {
    const { subdomain, managerToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/cafeteria/menus")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-03-02", description: "Riz, poulet braisé, légumes" });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/cafeteria/menus")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-03-02", description: "Riz, poulet braisé, légumes" });
    expect(created.status).toBe(201);
    const menuId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/cafeteria/menus")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-03-02", description: "Autre menu" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("MENU_ALREADY_EXISTS");

    const updated = await request(app)
      .patch(`/api/v1/cafeteria/menus/${menuId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ description: "Riz, poisson, légumes" });
    expect(updated.status).toBe(200);
    expect((updated.body as { description: string }).description).toBe("Riz, poisson, légumes");

    const listed = await request(app)
      .get("/api/v1/cafeteria/menus?startDate=2026-03-01&endDate=2026-03-31")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((m) => m.id === menuId)).toBe(true);

    const removed = await request(app)
      .delete(`/api/v1/cafeteria/menus/${menuId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removed.status).toBe(204);

    const fetchAfterRemoval = await request(app)
      .get(`/api/v1/cafeteria/menus/${menuId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetchAfterRemoval.status).toBe(404);
  });

  it("enrolls a student in a meal plan, blocks a second active enrollment, tracks payment, and records daily attendance", async () => {
    const { subdomain, managerToken, studentId } = await setUpTenant();

    const mealPlan = await request(app)
      .post("/api/v1/cafeteria/meal-plans")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Formule mensuelle", type: "MONTHLY", priceCents: 25_000 });
    expect(mealPlan.status).toBe(201);
    const mealPlanId = (mealPlan.body as { id: string }).id;

    const otherMealPlan = await request(app)
      .post("/api/v1/cafeteria/meal-plans")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Formule journalière", type: "DAILY", priceCents: 1_500 });
    const otherMealPlanId = (otherMealPlan.body as { id: string }).id;

    const enrollment = await request(app)
      .post("/api/v1/cafeteria/enrollments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, mealPlanId, startDate: "2026-03-01" });
    expect(enrollment.status).toBe(201);
    const enrollmentBody = enrollment.body as { id: string; status: string; paid: boolean };
    expect(enrollmentBody.status).toBe("ACTIVE");
    expect(enrollmentBody.paid).toBe(false);
    const enrollmentId = enrollmentBody.id;

    const duplicateEnrollment = await request(app)
      .post("/api/v1/cafeteria/enrollments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, mealPlanId: otherMealPlanId, startDate: "2026-03-15" });
    expect(duplicateEnrollment.status).toBe(409);
    expect((duplicateEnrollment.body as { code: string }).code).toBe("ENROLLMENT_ALREADY_ACTIVE");

    const paid = await request(app)
      .post(`/api/v1/cafeteria/enrollments/${enrollmentId}/mark-paid`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(paid.status).toBe(200);
    expect((paid.body as { paid: boolean }).paid).toBe(true);

    const served = await request(app)
      .post(`/api/v1/cafeteria/enrollments/${enrollmentId}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-03-03", status: "SERVED" });
    expect(served.status).toBe(200);

    // Meme jour, corrige en absent — un upsert, jamais une deuxieme ligne.
    const corrected = await request(app)
      .post(`/api/v1/cafeteria/enrollments/${enrollmentId}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-03-03", status: "ABSENT" });
    expect(corrected.status).toBe(200);

    const listedAttendance = await request(app)
      .get(`/api/v1/cafeteria/enrollments/${enrollmentId}/attendance?date=2026-03-03`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedAttendance.status).toBe(200);
    const attendances = listedAttendance.body as { status: string }[];
    expect(attendances.length).toBe(1);
    expect(attendances[0]?.status).toBe("ABSENT");

    const cancelled = await request(app)
      .post(`/api/v1/cafeteria/enrollments/${enrollmentId}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { status: string }).status).toBe("CANCELLED");

    const cancelAgain = await request(app)
      .post(`/api/v1/cafeteria/enrollments/${enrollmentId}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelAgain.status).toBe(409);
    expect((cancelAgain.body as { code: string }).code).toBe("ENROLLMENT_ALREADY_CANCELLED");

    // La formule precedente est annulee : une nouvelle inscription redevient possible.
    const secondEnrollment = await request(app)
      .post("/api/v1/cafeteria/enrollments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, mealPlanId: otherMealPlanId, startDate: "2026-04-01" });
    expect(secondEnrollment.status).toBe(201);

    const archived = await request(app)
      .post(`/api/v1/cafeteria/meal-plans/${mealPlanId}/archive`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(archived.status).toBe(200);

    const listedPlans = await request(app)
      .get("/api/v1/cafeteria/meal-plans")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedPlans.body as { id: string }[]).some((p) => p.id === mealPlanId)).toBe(false);
  }, 20000);
});
