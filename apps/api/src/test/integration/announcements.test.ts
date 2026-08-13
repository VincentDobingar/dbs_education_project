import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("annonces (§28)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.announcement.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

  it("crée, liste et supprime des annonces, avec guarde de permission et de classroomId", async () => {
    const { tenant, subdomain } = await createTenant("AnnouncementTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("ann-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacher = await createUser("ann-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const denied = await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Réunion parents", body: "Le 10 octobre à 17h." });
    expect(denied.status).toBe(403);

    const missingClassroom = await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Sortie scolaire", body: "Détails à venir.", audienceScope: "CLASSROOM" });
    expect(missingClassroom.status).toBe(400);

    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });

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

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e A ${uniqueSuffix()}`,
        academicYearId: (year.body as { id: string }).id,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId: (gradeLevel.body as { id: string }).id,
        capacity: 40,
      });
    const classroomId = (classroom.body as { id: string }).id;

    const createdAll = await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Rentrée scolaire", body: "La rentrée aura lieu le 2 septembre." });
    expect(createdAll.status).toBe(201);

    const createdClassroom = await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        title: "Sortie scolaire 6e A",
        body: "Sortie au musée le 15 octobre.",
        audienceScope: "CLASSROOM",
        classroomId,
      });
    expect(createdClassroom.status).toBe(201);
    const classroomAnnouncementId = (createdClassroom.body as { id: string }).id;

    const listAll = await request(app)
      .get("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listAll.status).toBe(200);
    expect((listAll.body as unknown[]).length).toBe(2);

    const listByClassroom = await request(app)
      .get(`/api/v1/communication/announcements?classroomId=${classroomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listByClassroom.body as { id: string }[]).length).toBe(1);
    expect((listByClassroom.body as { id: string }[])[0]?.id).toBe(classroomAnnouncementId);

    const removed = await request(app)
      .delete(`/api/v1/communication/announcements/${classroomAnnouncementId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removed.status).toBe(204);

    const listAfterRemoval = await request(app)
      .get("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listAfterRemoval.body as unknown[]).length).toBe(1);
  });
});
