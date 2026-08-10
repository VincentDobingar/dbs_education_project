import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("programmes et coefficients (§20)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.subjectCoefficient.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.program.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    const { tenant, subdomain } = await createTenant("ProgramTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("pg-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("pg-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function setUpGradeLevel(subdomain: string, adminToken: string): Promise<string> {
    const cycle = await request(app)
      .post("/api/v1/school-config/education-cycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `CYC-${uniqueSuffix()}`, nameFr: "Lycée", nameEn: "High school", order: 1 });

    const gradeLevel = await request(app)
      .post(`/api/v1/school-config/education-cycles/${(cycle.body as { id: string }).id}/grade-levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `TLE-${uniqueSuffix()}`, nameFr: "Terminale", nameEn: "Grade 12", order: 1 });

    return (gradeLevel.body as { id: string }).id;
  }

  it("lets a SCHOOL_OWNER manage programs, but refuses a TEACHER; guards duplicate codes", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();
    const gradeLevelId = await setUpGradeLevel(subdomain, adminToken);

    const denied = await request(app)
      .post("/api/v1/school-config/programs")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: "SCI-D", nameFr: "Série D", nameEn: "Science track D", gradeLevelId });
    expect(denied.status).toBe(403);

    const code = `SCI-${uniqueSuffix()}`;
    const created = await request(app)
      .post("/api/v1/school-config/programs")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Série D", nameEn: "Science track D", gradeLevelId });
    expect(created.status).toBe(201);
    const programId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/school-config/programs")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Autre", nameEn: "Other" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("PROGRAM_CODE_TAKEN");

    const updated = await request(app)
      .patch(`/api/v1/school-config/programs/${programId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ nameEn: "Science stream D" });
    expect(updated.status).toBe(200);
    expect((updated.body as { nameEn: string }).nameEn).toBe("Science stream D");

    const listed = await request(app)
      .get(`/api/v1/school-config/programs?gradeLevelId=${gradeLevelId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((p) => p.id === programId)).toBe(true);
  });

  it("lets a SCHOOL_OWNER set/update/remove a subject coefficient per grade level", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();
    const gradeLevelId = await setUpGradeLevel(subdomain, adminToken);

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `PHY-${uniqueSuffix()}`, nameFr: "Physique", nameEn: "Physics" });
    const subjectId = (subject.body as { id: string }).id;

    const set = await request(app)
      .post(`/api/v1/school-config/subjects/${subjectId}/coefficients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ gradeLevelId, coefficient: 3 });
    expect(set.status).toBe(200);
    const coefficientId = (set.body as { id: string }).id;
    expect(Number((set.body as { coefficient: string }).coefficient)).toBe(3);

    const updated = await request(app)
      .post(`/api/v1/school-config/subjects/${subjectId}/coefficients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ gradeLevelId, coefficient: 4 });
    expect(updated.status).toBe(200);
    expect((updated.body as { id: string }).id).toBe(coefficientId);
    expect(Number((updated.body as { coefficient: string }).coefficient)).toBe(4);

    const listed = await request(app)
      .get(`/api/v1/school-config/subjects/${subjectId}/coefficients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(1);

    const removed = await request(app)
      .delete(`/api/v1/school-config/subjects/${subjectId}/coefficients/${coefficientId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removed.status).toBe(204);

    const removeAgain = await request(app)
      .delete(`/api/v1/school-config/subjects/${subjectId}/coefficients/${coefficientId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removeAgain.status).toBe(404);
  });
});
