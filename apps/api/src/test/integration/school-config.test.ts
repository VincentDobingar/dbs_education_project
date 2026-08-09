import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("school configuration (§20)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.department.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicPeriod.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    const { tenant, subdomain } = await createTenant("SchoolConfig");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_ADMIN", tenant.id);

    const teacher = await createUser("teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("lets a SCHOOL_ADMIN create a campus, but refuses a TEACHER (§17)", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();

    const denied = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}`, isMain: true });
    expect(created.status).toBe(201);
    const body = created.body as { id: string; isMain: boolean };
    expect(body.isMain).toBe(true);

    const listed = await request(app)
      .get("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBeGreaterThan(0);
  });

  it("creates an academic year, sets it current, and nests periods under it", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `2025-2026-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    expect(year.status).toBe(201);
    const yearBody = year.body as { id: string; isCurrent: boolean };
    expect(yearBody.isCurrent).toBe(false);

    const invalidRange = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `bad-${uniqueSuffix()}`, startDate: "2026-06-30", endDate: "2025-09-01" });
    expect(invalidRange.status).toBe(400);

    const setCurrent = await request(app)
      .post(`/api/v1/school-config/academic-years/${yearBody.id}/set-current`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(setCurrent.status).toBe(200);
    expect((setCurrent.body as { isCurrent: boolean }).isCurrent).toBe(true);

    const period = await request(app)
      .post(`/api/v1/school-config/academic-years/${yearBody.id}/periods`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: "Trimestre 1",
        type: "TRIMESTER",
        sequence: 1,
        startDate: "2025-09-01",
        endDate: "2025-12-15",
      });
    expect(period.status).toBe(201);

    const periods = await request(app)
      .get(`/api/v1/school-config/academic-years/${yearBody.id}/periods`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(periods.status).toBe(200);
    expect((periods.body as unknown[]).length).toBe(1);
  });

  it("builds the cycle -> grade level -> classroom chain, validating cross-references", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();

    const cycle = await request(app)
      .post("/api/v1/school-config/education-cycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `COLLEGE-${uniqueSuffix()}`, nameFr: "Collège", nameEn: "Middle school", order: 2 });
    expect(cycle.status).toBe(201);
    const cycleBody = cycle.body as { id: string };

    const gradeLevel = await request(app)
      .post(`/api/v1/school-config/education-cycles/${cycleBody.id}/grade-levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `6EME-${uniqueSuffix()}`, nameFr: "6ème", nameEn: "Grade 6", order: 1 });
    expect(gradeLevel.status).toBe(201);
    const gradeLevelBody = gradeLevel.body as { id: string };

    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus A", code: `CA-${uniqueSuffix()}` });
    const campusBody = campus.body as { id: string };

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const yearBody = year.body as { id: string };

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: "6e A",
        academicYearId: yearBody.id,
        campusId: campusBody.id,
        gradeLevelId: gradeLevelBody.id,
        capacity: 40,
      });
    expect(classroom.status).toBe(201);

    const crossTenantGradeLevel = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: "6e B",
        academicYearId: yearBody.id,
        campusId: campusBody.id,
        gradeLevelId: "non-existent-grade-level",
        capacity: 40,
      });
    expect(crossTenantGradeLevel.status).toBe(404);
  });

  it("creates departments and subjects, refusing an unknown department reference", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();

    const department = await request(app)
      .post("/api/v1/school-config/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `SCI-${uniqueSuffix()}`, nameFr: "Sciences", nameEn: "Sciences" });
    expect(department.status).toBe(201);
    const departmentBody = department.body as { id: string };

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        code: `MATH-${uniqueSuffix()}`,
        nameFr: "Mathématiques",
        nameEn: "Mathematics",
        departmentId: departmentBody.id,
      });
    expect(subject.status).toBe(201);

    const badSubject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        code: `PHY-${uniqueSuffix()}`,
        nameFr: "Physique",
        nameEn: "Physics",
        departmentId: "unknown-department",
      });
    expect(badSubject.status).toBe(404);
  });
});
