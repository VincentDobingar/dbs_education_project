import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("élèves et inscriptions (§19)", () => {
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
    const { tenant, subdomain } = await createTenant("StudentsTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("students-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("students-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  /** Builds one campus/academic-year/cycle/grade-level/classroom chain via the school-config API. */
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

  it("lets a SCHOOL_OWNER create a student, but refuses a TEACHER without students.write", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenantWithOwner();

    const denied = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Awa", lastName: "Ngo" });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        matricule: `MAT-${uniqueSuffix()}`,
        firstName: "Awa",
        lastName: "Ngo",
        medicalNotes: "Allergie aux arachides",
      });
    expect(created.status).toBe(201);
    const body = created.body as Record<string, unknown>;
    expect(body.status).toBe("PROSPECTIVE");
    expect(body).not.toHaveProperty("medicalNotes");

    const fetched = await request(app)
      .get(`/api/v1/students/${body.id as string}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);
    expect(fetched.body).not.toHaveProperty("medicalNotes");

    const listed = await request(app)
      .get("/api/v1/students")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    const students = listed.body as Record<string, unknown>[];
    expect(students.length).toBe(1);
    expect(students[0]).not.toHaveProperty("medicalNotes");
  });

  it("rejects a duplicate matricule within the same tenant", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const matricule = `MAT-${uniqueSuffix()}`;

    const first = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule, firstName: "Jean", lastName: "Mbala" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule, firstName: "Paul", lastName: "Eto" });
    expect(second.status).toBe(409);
    expect((second.body as { code: string }).code).toBe("MATRICULE_TAKEN");
  });

  it("updates status and archives a student (soft delete)", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const created = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Fatou", lastName: "Diallo" });
    const studentId = (created.body as { id: string }).id;

    const active = await request(app)
      .patch(`/api/v1/students/${studentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "ACTIVE" });
    expect(active.status).toBe(200);
    expect((active.body as { status: string }).status).toBe("ACTIVE");

    const archived = await request(app)
      .post(`/api/v1/students/${studentId}/archive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(archived.status).toBe(200);

    const fetchAfterArchive = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetchAfterArchive.status).toBe(404);
  });

  it("enrolls a student, bumping PROSPECTIVE to ACTIVE, and refuses a second enrollment for the same year", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const { academicYearId, campusId, gradeLevelId, classroomId } = await setUpClassroom(
      subdomain,
      ownerToken,
    );

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Léa", lastName: "Kamga" });
    const studentId = (student.body as { id: string }).id;
    expect((student.body as { status: string }).status).toBe("PROSPECTIVE");

    const enrolled = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, campusId, gradeLevelId, classroomId });
    expect(enrolled.status).toBe(201);
    expect((enrolled.body as { status: string }).status).toBe("ENROLLED");

    const studentAfter = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((studentAfter.body as { status: string }).status).toBe("ACTIVE");

    const secondEnrollment = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, campusId, gradeLevelId, classroomId });
    expect(secondEnrollment.status).toBe(409);
    expect((secondEnrollment.body as { code: string }).code).toBe("ALREADY_ENROLLED_THIS_YEAR");

    const secondStudent = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Second", lastName: "Élève" });
    const secondStudentId = (secondStudent.body as { id: string }).id;

    const unknownClassroom = await request(app)
      .post(`/api/v1/students/${secondStudentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, campusId, gradeLevelId, classroomId: "non-existent-classroom" });
    expect(unknownClassroom.status).toBe(404);
    expect((unknownClassroom.body as { code: string }).code).toBe("CLASSROOM_NOT_FOUND");
  });

  it("rejects an enrollment whose classroom belongs to a different academic year", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const { campusId, gradeLevelId, classroomId } = await setUpClassroom(subdomain, ownerToken);

    const otherYear = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `OtherY-${uniqueSuffix()}`, startDate: "2026-09-01", endDate: "2027-06-30" });

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Idriss", lastName: "Bello" });
    const studentId = (student.body as { id: string }).id;

    const mismatched = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId: (otherYear.body as { id: string }).id, campusId, gradeLevelId, classroomId });
    expect(mismatched.status).toBe(400);
    expect((mismatched.body as { code: string }).code).toBe("CLASSROOM_YEAR_MISMATCH");
  });

  it("updates an enrollment's status and lists a student's enrollments", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
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

    const enrolled = await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, campusId, gradeLevelId, classroomId });
    const enrollmentId = (enrolled.body as { id: string }).id;

    const withdrawn = await request(app)
      .patch(`/api/v1/students/${studentId}/enrollments/${enrollmentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "WITHDRAWN" });
    expect(withdrawn.status).toBe(200);
    expect((withdrawn.body as { status: string; withdrawnAt: string | null }).status).toBe("WITHDRAWN");
    expect((withdrawn.body as { withdrawnAt: string | null }).withdrawnAt).not.toBeNull();

    const listed = await request(app)
      .get(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(1);

    const unknownEnrollment = await request(app)
      .patch(`/api/v1/students/${studentId}/enrollments/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "GRADUATED" });
    expect(unknownEnrollment.status).toBe(404);
    expect((unknownEnrollment.body as { code: string }).code).toBe("ENROLLMENT_NOT_FOUND");
  });
});
