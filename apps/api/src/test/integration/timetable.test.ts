import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("emplois du temps (§20)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.timetableEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetable.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.teacherAssignment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    const { tenant, subdomain } = await createTenant("TimetableTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("tt-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("tt-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function setUpAcademicStructure(
    subdomain: string,
    adminToken: string,
  ): Promise<{
    academicYearId: string;
    campusId: string;
    gradeLevelId: string;
    classroomId: string;
    subjectId: string;
  }> {
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

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });

    return {
      academicYearId: (year.body as { id: string }).id,
      campusId: (campus.body as { id: string }).id,
      gradeLevelId: (gradeLevel.body as { id: string }).id,
      classroomId: (classroom.body as { id: string }).id,
      subjectId: (subject.body as { id: string }).id,
    };
  }

  async function createTeacherEmployee(subdomain: string, adminToken: string): Promise<string> {
    const employee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Awa",
        lastName: "Ngo",
        jobTitle: "Enseignante",
      });
    return (employee.body as { id: string }).id;
  }

  it("lets a SCHOOL_OWNER assign a teacher, but refuses a TEACHER; guards duplicates and year mismatches", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();
    const { academicYearId, classroomId, subjectId } = await setUpAcademicStructure(subdomain, adminToken);
    const employeeId = await createTeacherEmployee(subdomain, adminToken);

    const denied = await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeId, subjectId, classroomId, academicYearId });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeId, subjectId, classroomId, academicYearId, hoursPerWeek: 4 });
    expect(created.status).toBe(201);
    const assignmentId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeId, subjectId, classroomId, academicYearId });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("ASSIGNMENT_ALREADY_EXISTS");

    const otherYear = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `OtherY-${uniqueSuffix()}`, startDate: "2026-09-01", endDate: "2027-06-30" });
    const mismatched = await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeId,
        subjectId,
        classroomId,
        academicYearId: (otherYear.body as { id: string }).id,
      });
    expect(mismatched.status).toBe(400);
    expect((mismatched.body as { code: string }).code).toBe("CLASSROOM_YEAR_MISMATCH");

    const listed = await request(app)
      .get(`/api/v1/school-config/teacher-assignments?classroomId=${classroomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((a) => a.id === assignmentId)).toBe(true);

    const removed = await request(app)
      .delete(`/api/v1/school-config/teacher-assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removed.status).toBe(204);

    const removeAgain = await request(app)
      .delete(`/api/v1/school-config/teacher-assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removeAgain.status).toBe(404);
  });

  it("builds a timetable, detects classroom conflicts, and detects teacher conflicts across classrooms", async () => {
    const { subdomain, adminToken } = await setUpTenantWithAdmin();
    const { academicYearId, campusId, gradeLevelId, classroomId, subjectId } = await setUpAcademicStructure(
      subdomain,
      adminToken,
    );
    const employeeId = await createTeacherEmployee(subdomain, adminToken);

    const timetable = await request(app)
      .post("/api/v1/school-config/timetables")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicYearId, name: "Grille standard" });
    expect(timetable.status).toBe(201);
    const timetableId = (timetable.body as { id: string }).id;

    const invalidRange = await request(app)
      .post(`/api/v1/school-config/timetables/${timetableId}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subjectId, teacherEmployeeId: employeeId, dayOfWeek: 1, startTime: "10:00", endTime: "09:00" });
    expect(invalidRange.status).toBe(400);

    const entry = await request(app)
      .post(`/api/v1/school-config/timetables/${timetableId}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subjectId, teacherEmployeeId: employeeId, dayOfWeek: 1, startTime: "08:00", endTime: "09:00" });
    expect(entry.status).toBe(201);
    const entryId = (entry.body as { id: string }).id;

    const classroomConflict = await request(app)
      .post(`/api/v1/school-config/timetables/${timetableId}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subjectId, teacherEmployeeId: employeeId, dayOfWeek: 1, startTime: "08:30", endTime: "09:30" });
    expect(classroomConflict.status).toBe(409);
    expect((classroomConflict.body as { code: string }).code).toBe("CLASSROOM_SCHEDULE_CONFLICT");

    // A second classroom, same academic year — the teacher can't be in both places at once.
    const secondClassroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e B ${uniqueSuffix()}`,
        academicYearId,
        campusId,
        gradeLevelId,
        capacity: 40,
      });
    const secondTimetable = await request(app)
      .post("/api/v1/school-config/timetables")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId: (secondClassroom.body as { id: string }).id, academicYearId });

    const teacherConflict = await request(app)
      .post(`/api/v1/school-config/timetables/${(secondTimetable.body as { id: string }).id}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subjectId, teacherEmployeeId: employeeId, dayOfWeek: 1, startTime: "08:30", endTime: "09:30" });
    expect(teacherConflict.status).toBe(409);
    expect((teacherConflict.body as { code: string }).code).toBe("TEACHER_SCHEDULE_CONFLICT");

    const listed = await request(app)
      .get(`/api/v1/school-config/timetables/${timetableId}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(1);

    const removed = await request(app)
      .delete(`/api/v1/school-config/timetables/${timetableId}/entries/${entryId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removed.status).toBe(204);

    const removeUnknown = await request(app)
      .delete(`/api/v1/school-config/timetables/${timetableId}/entries/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removeUnknown.status).toBe(404);
  });
});
