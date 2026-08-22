import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("ressources humaines — contrats, présences, congés, évaluations, documents, paie (§27)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.employeeDocument.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.performanceEvaluation.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.leaveRequest.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employeeAttendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employmentContract.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.teacherAssignment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.rolePermission.deleteMany({ where: { roleId: { in: createdRoleIds } } });
    await testAdminPrisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  /**
   * §27 : « les informations salariales doivent avoir des permissions
   * particulièrement restrictives ». Aucun rôle seedé n'a hr.manage sans
   * hr.salary.manage (SCHOOL_OWNER/HR_MANAGER ont les deux) — ce rôle jetable isole
   * la démonstration que les deux permissions gardent des routes réellement
   * différentes, pas seulement en théorie.
   */
  async function grantHrManageWithoutSalaryAccess(userId: string, tenantId: string): Promise<void> {
    const hrManagePermission = await testAdminPrisma.permission.findUniqueOrThrow({
      where: { code: "hr.manage" },
    });
    const role = await testAdminPrisma.role.create({
      data: {
        code: `HR_ASSISTANT_TEST_${uniqueSuffix()}`,
        nameFr: "Assistant RH (test)",
        nameEn: "HR Assistant (test)",
        scope: "TENANT",
        isSystem: false,
        permissions: { create: { permissionId: hrManagePermission.id } },
      },
    });
    createdRoleIds.push(role.id);
    await testAdminPrisma.userRole.create({ data: { userId, roleId: role.id, tenantId } });
  }

  async function setUpTenantWithStaff(): Promise<{
    subdomain: string;
    ownerToken: string;
    assistantToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("HrTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("hr2-owner");
    createdUserIds.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const assistant = await createUser("hr2-assistant");
    createdUserIds.push(assistant.id);
    await addMembership(assistant.id, tenant.id);
    await grantHrManageWithoutSalaryAccess(assistant.id, tenant.id);

    const teacher = await createUser("hr2-teacher");
    createdUserIds.push(teacher.id);
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      assistantToken: signAccessToken({ sub: assistant.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function createEmployee(subdomain: string, ownerToken: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Comptable",
      });
    expect(created.status).toBe(201);
    return (created.body as { id: string }).id;
  }

  it("gates contracts by hr.salary.manage — distinct from hr.manage — and lists them oldest first", async () => {
    const { subdomain, ownerToken, assistantToken, teacherToken } = await setUpTenantWithStaff();
    const employeeId = await createEmployee(subdomain, ownerToken);

    const deniedForAssistant = await request(app)
      .post(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ contractType: "CDI", startDate: "2024-01-01", salaryCents: 300_000 });
    expect(deniedForAssistant.status).toBe(403);

    const deniedForTeacher = await request(app)
      .get(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(deniedForTeacher.status).toBe(403);

    const firstContract = await request(app)
      .post(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ contractType: "CDD", startDate: "2023-01-01", endDate: "2023-12-31", salaryCents: 250_000 });
    expect(firstContract.status).toBe(201);

    const secondContract = await request(app)
      .post(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ contractType: "CDI", startDate: "2024-01-01", salaryCents: 300_000 });
    expect(secondContract.status).toBe(201);
    const secondContractId = (secondContract.body as { id: string }).id;

    const listed = await request(app)
      .get(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    const contracts = listed.body as { contractType: string; salaryCents: number }[];
    expect(contracts.map((c) => c.contractType)).toEqual(["CDD", "CDI"]);

    const updated = await request(app)
      .patch(`/api/v1/employees/${employeeId}/contracts/${secondContractId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ salaryCents: 320_000 });
    expect(updated.status).toBe(200);
    expect((updated.body as { salaryCents: number }).salaryCents).toBe(320_000);

    // La fiche générale du personnel ne joint toujours aucune donnée salariale (§27).
    const employeeDetail = await request(app)
      .get(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(employeeDetail.body).not.toHaveProperty("salaryCents");
  });

  it("records daily attendance (upsert), tracks leave requests through a decision, evaluations, and documents — all under hr.manage", async () => {
    const { subdomain, ownerToken, assistantToken } = await setUpTenantWithStaff();
    const employeeId = await createEmployee(subdomain, ownerToken);

    const presentDay = await request(app)
      .post(`/api/v1/employees/${employeeId}/attendance`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-02-02", status: "PRESENT" });
    expect(presentDay.status).toBe(200);

    // Meme jour, corrige en retard — un upsert, jamais une deuxieme ligne.
    const correctedToLate = await request(app)
      .post(`/api/v1/employees/${employeeId}/attendance`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-02-02", status: "LATE", checkInAt: "2026-02-02T09:15:00.000Z" });
    expect(correctedToLate.status).toBe(200);

    const attendanceList = await request(app)
      .get(`/api/v1/employees/${employeeId}/attendance`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(attendanceList.status).toBe(200);
    const attendances = attendanceList.body as { status: string }[];
    expect(attendances.length).toBe(1);
    expect(attendances[0]?.status).toBe("LATE");

    const leaveRequest = await request(app)
      .post(`/api/v1/employees/${employeeId}/leave-requests`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "ANNUAL", startDate: "2026-03-01", endDate: "2026-03-10", reason: "Congés annuels" });
    expect(leaveRequest.status).toBe(201);
    expect((leaveRequest.body as { status: string }).status).toBe("PENDING");
    const leaveRequestId = (leaveRequest.body as { id: string }).id;

    const approved = await request(app)
      .patch(`/api/v1/employees/${employeeId}/leave-requests/${leaveRequestId}/decision`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "APPROVED" });
    expect(approved.status).toBe(200);
    expect((approved.body as { status: string }).status).toBe("APPROVED");

    const decideAgain = await request(app)
      .patch(`/api/v1/employees/${employeeId}/leave-requests/${leaveRequestId}/decision`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "REJECTED" });
    expect(decideAgain.status).toBe(409);
    expect((decideAgain.body as { code: string }).code).toBe("LEAVE_REQUEST_ALREADY_DECIDED");

    const evaluation = await request(app)
      .post(`/api/v1/employees/${employeeId}/evaluations`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ periodStart: "2025-09-01", periodEnd: "2026-06-30", score: 4, comments: "Bon travail" });
    expect(evaluation.status).toBe(201);

    const evaluations = await request(app)
      .get(`/api/v1/employees/${employeeId}/evaluations`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(evaluations.status).toBe(200);
    expect((evaluations.body as unknown[]).length).toBe(1);

    const document = await request(app)
      .post(`/api/v1/employees/${employeeId}/documents`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ category: "CONTRACT_SCAN", fileUrl: "https://files.example.test/doc.pdf" });
    expect(document.status).toBe(201);
    const documentId = (document.body as { id: string }).id;

    const removed = await request(app)
      .delete(`/api/v1/employees/${employeeId}/documents/${documentId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removed.status).toBe(204);

    const documentsAfterRemoval = await request(app)
      .get(`/api/v1/employees/${employeeId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((documentsAfterRemoval.body as unknown[]).length).toBe(0);
  }, 20000);

  it("aggregates workload hours from TeacherAssignment.hoursPerWeek", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithStaff();
    const employeeId = await createEmployee(subdomain, ownerToken);

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
    const academicYearId = (year.body as { id: string }).id;

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

    const classroomA = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e A ${uniqueSuffix()}`,
        academicYearId,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId: (gradeLevel.body as { id: string }).id,
        capacity: 40,
      });
    const classroomB = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e B ${uniqueSuffix()}`,
        academicYearId,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId: (gradeLevel.body as { id: string }).id,
        capacity: 40,
      });

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });
    const subjectId = (subject.body as { id: string }).id;

    await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeId,
        subjectId,
        classroomId: (classroomA.body as { id: string }).id,
        academicYearId,
        hoursPerWeek: 4,
      });
    await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeId,
        subjectId,
        classroomId: (classroomB.body as { id: string }).id,
        academicYearId,
        hoursPerWeek: 3.5,
      });

    const workload = await request(app)
      .get(`/api/v1/employees/${employeeId}/workload?academicYearId=${academicYearId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(workload.status).toBe(200);
    const body = workload.body as { assignments: unknown[]; totalHoursPerWeek: number };
    expect(body.assignments.length).toBe(2);
    expect(body.totalHoursPerWeek).toBe(7.5);
  }, 20000);

  it("exports payroll as CSV, gated by hr.salary.manage, including only the active contract", async () => {
    const { subdomain, ownerToken, assistantToken } = await setUpTenantWithStaff();
    const employeeId = await createEmployee(subdomain, ownerToken);

    await request(app)
      .post(`/api/v1/employees/${employeeId}/contracts`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ contractType: "CDI", startDate: "2020-01-01", salaryCents: 275_000 });

    const deniedForAssistant = await request(app)
      .get("/api/v1/employees/payroll/export.csv")
      .set("Authorization", `Bearer ${assistantToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(deniedForAssistant.status).toBe(403);

    const exported = await request(app)
      .get("/api/v1/employees/payroll/export.csv")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.text).toContain("2750.00");
    expect(exported.text).toContain("CDI");
  });
});
