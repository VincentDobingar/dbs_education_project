import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("cartes scolaires (§19)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.enrollment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenantWithOwner(): Promise<{
    subdomain: string;
    ownerToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("IdCardTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("card-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("card-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function setUpClassroom(
    subdomain: string,
    ownerToken: string,
  ): Promise<{ academicYearId: string; campusId: string; gradeLevelId: string; classroomId: string }> {
    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });

    const cycle = await request(app)
      .post("/api/v1/school-config/education-cycles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `CYC-${uniqueSuffix()}`, nameFr: "Collège", nameEn: "Middle school", order: 1 });

    const gradeLevel = await request(app)
      .post(`/api/v1/school-config/education-cycles/${(cycle.body as { id: string }).id}/grade-levels`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `6EME-${uniqueSuffix()}`, nameFr: "6ème", nameEn: "Grade 6", order: 1 });

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e A ${uniqueSuffix()}`,
        academicYearId: (year.body as { id: string }).id,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId: (gradeLevel.body as { id: string }).id,
        capacity: 40,
      });

    return {
      academicYearId: (year.body as { id: string }).id,
      campusId: (campus.body as { id: string }).id,
      gradeLevelId: (gradeLevel.body as { id: string }).id,
      classroomId: (classroom.body as { id: string }).id,
    };
  }

  it("generates a PDF card for an enrolled student, viewable by a TEACHER (students.read)", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenantWithOwner();
    const { academicYearId, campusId, gradeLevelId, classroomId } = await setUpClassroom(
      subdomain,
      ownerToken,
    );

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Nadia", lastName: "Sow" });
    const studentId = (student.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, campusId, gradeLevelId, classroomId });

    const card = await request(app)
      .get(`/api/v1/students/${studentId}/id-card`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(card.status).toBe(200);
    expect(card.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.isBuffer(card.body)).toBe(true);
    expect((card.body as Buffer).subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("refuses to generate a card for a student with no active enrollment", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Idriss", lastName: "Bello" });
    const studentId = (student.body as { id: string }).id;

    const card = await request(app)
      .get(`/api/v1/students/${studentId}/id-card`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(card.status).toBe(400);
    expect((card.body as { code: string }).code).toBe("STUDENT_NOT_ENROLLED");
  });
});
