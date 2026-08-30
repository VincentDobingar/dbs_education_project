import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("présences et discipline (§22)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.disciplinaryIncident.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.attendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    teacherEmployeeId: string;
  }> {
    const { tenant, subdomain } = await createTenant("AttendanceTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("at-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("at-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherEmployee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
        userId: teacher.id,
      });

    return {
      subdomain,
      adminToken,
      teacherToken: signAccessToken({ sub: teacher.id }),
      teacherEmployeeId: (teacherEmployee.body as { id: string }).id,
    };
  }

  async function setUpClassAndStudents(
    subdomain: string,
    adminToken: string,
  ): Promise<{ classroomId: string; studentIds: string[] }> {
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

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e A ${uniqueSuffix()}`,
        academicYearId,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId: (gradeLevel.body as { id: string }).id,
        capacity: 40,
      });

    const studentIds: string[] = [];
    for (const [firstName, lastName] of [
      ["Awa", "Ngo"],
      ["Boris", "Ekani"],
    ]) {
      const student = await request(app)
        .post("/api/v1/students")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-Slug", subdomain)
        .send({ matricule: `MAT-${uniqueSuffix()}`, firstName, lastName });
      studentIds.push((student.body as { id: string }).id);
    }

    return { classroomId: (classroom.body as { id: string }).id, studentIds };
  }

  it("records a roll call idempotently, refuses unauthorized writes, and justifies an absence", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();
    const { classroomId, studentIds } = await setUpClassAndStudents(subdomain, adminToken);
    const [studentA, studentB] = studentIds;

    const denied = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        date: "2025-10-01",
        entries: [
          { studentId: studentA, status: "PRESENT" },
          { studentId: studentB, status: "ABSENT" },
        ],
      });
    expect(denied.status).toBe(403);

    const recorded = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        date: "2025-10-01",
        entries: [
          { studentId: studentA, status: "PRESENT" },
          { studentId: studentB, status: "ABSENT" },
        ],
      });
    expect(recorded.status).toBe(200);
    expect((recorded.body as unknown[]).length).toBe(2);

    // Resubmitting the same day/classroom must update in place, never duplicate —
    // this exercises the findFirst-based upsert (subjectId is null here, and Postgres
    // doesn't treat two NULLs as equal for a native unique-constraint upsert).
    const resubmitted = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        date: "2025-10-01",
        entries: [
          { studentId: studentA, status: "PRESENT" },
          { studentId: studentB, status: "LATE" },
        ],
      });
    expect(resubmitted.status).toBe(200);

    const listed = await request(app)
      .get(`/api/v1/attendance?classroomId=${classroomId}&date=2025-10-01`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    const records = listed.body as { id: string; studentId: string; status: string }[];
    expect(records.length).toBe(2);
    expect(records.find((r) => r.studentId === studentB)?.status).toBe("LATE");

    const backToAbsent = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, date: "2025-10-01", entries: [{ studentId: studentB, status: "ABSENT" }] });
    const absentRecordId = (backToAbsent.body as { id: string }[])[0]?.id as string;

    const deniedJustify = await request(app)
      .patch(
        `/api/v1/attendance/${(records.find((r) => r.studentId === studentA) as { id: string }).id}/justify`,
      )
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ justificationNote: "Certificat médical" });
    expect(deniedJustify.status).toBe(400);
    expect((deniedJustify.body as { code: string }).code).toBe("NOT_AN_ABSENCE");

    const justified = await request(app)
      .patch(`/api/v1/attendance/${absentRecordId}/justify`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ justificationNote: "Certificat médical" });
    expect(justified.status).toBe(200);
    expect((justified.body as { status: string }).status).toBe("EXCUSED");
    expect((justified.body as { justificationNote: string }).justificationNote).toBe("Certificat médical");
  });

  it("lets staff report, update, and soft-delete disciplinary incidents, and lists a student's history", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();
    const { studentIds } = await setUpClassAndStudents(subdomain, adminToken);
    const [studentA] = studentIds;

    const denied = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: studentA,
        occurredAt: "2025-10-02",
        description: "Bavardage répété en classe",
        severity: "MINOR",
      });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: studentA,
        occurredAt: "2025-10-02",
        description: "Bagarre dans la cour",
        severity: "SEVERE",
        sanction: "Convocation des parents",
      });
    expect(created.status).toBe(201);
    const incidentId = (created.body as { id: string }).id;

    const listed = await request(app)
      .get(`/api/v1/discipline/incidents?studentId=${studentA}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((i) => i.id === incidentId)).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/discipline/incidents/${incidentId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ correctiveAction: "Suivi hebdomadaire avec le conseiller" });
    expect(updated.status).toBe(200);
    expect((updated.body as { correctiveAction: string }).correctiveAction).toBe(
      "Suivi hebdomadaire avec le conseiller",
    );

    const history = await request(app)
      .get(`/api/v1/discipline/students/${studentA}/history`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(history.status).toBe(200);
    expect((history.body as { id: string }[]).length).toBe(1);

    const removed = await request(app)
      .delete(`/api/v1/discipline/incidents/${incidentId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removed.status).toBe(204);

    const historyAfterRemoval = await request(app)
      .get(`/api/v1/discipline/students/${studentA}/history`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((historyAfterRemoval.body as unknown[]).length).toBe(0);
  });

  // resolveActingEmployeeId (lib/acting-employee.ts) already excluded a terminated
  // employee, but recordRollCall/createIncident never checked its result was
  // non-null — both writes went through regardless, just with recordedByEmployeeId/
  // reportedByEmployeeId silently left unset. Same bug family as the already-fixed
  // cash-payment/cash-session checks, reopened here.
  it("refuses to record attendance or report an incident once the teacher has been terminated", async () => {
    const { subdomain, adminToken, teacherToken, teacherEmployeeId } = await setUpTenantWithAdmin();
    const { classroomId, studentIds } = await setUpClassAndStudents(subdomain, adminToken);
    const [studentA] = studentIds;

    const patched = await request(app)
      .patch(`/api/v1/employees/${teacherEmployeeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "TERMINATED" });
    expect(patched.status).toBe(200);

    const blockedRollCall = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, date: "2025-10-01", entries: [{ studentId: studentA, status: "PRESENT" }] });
    expect(blockedRollCall.status).toBe(403);
    expect((blockedRollCall.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");

    const blockedIncident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: studentA,
        occurredAt: "2025-10-02",
        description: "Bavardage répété en classe",
        severity: "MINOR",
      });
    expect(blockedIncident.status).toBe(403);
    expect((blockedIncident.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");
  });
});
