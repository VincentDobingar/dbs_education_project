import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("notes et évaluations (§21)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.gradeChangeLog.deleteMany({
      where: { grade: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.grade.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.assessment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.assessmentType.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicPeriod.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    const { tenant, subdomain } = await createTenant("GradingTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("gr-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("gr-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function setUpClassAndStudents(
    subdomain: string,
    adminToken: string,
  ): Promise<{
    academicPeriodId: string;
    classroomId: string;
    subjectId: string;
    studentIds: string[];
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
    const academicYearId = (year.body as { id: string }).id;

    const period = await request(app)
      .post(`/api/v1/school-config/academic-years/${academicYearId}/periods`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: "Trimestre 1",
        type: "TRIMESTER",
        sequence: 1,
        startDate: "2025-09-01",
        endDate: "2025-12-15",
      });

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

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });

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

    return {
      academicPeriodId: (period.body as { id: string }).id,
      classroomId: (classroom.body as { id: string }).id,
      subjectId: (subject.body as { id: string }).id,
      studentIds,
    };
  }

  it("lets a SCHOOL_OWNER manage assessment types, but refuses a TEACHER; guards duplicate codes", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();

    const denied = await request(app)
      .post("/api/v1/grading/assessment-types")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: "DEVOIR", nameFr: "Devoir", nameEn: "Homework" });
    expect(denied.status).toBe(403);

    const code = `DEVOIR-${uniqueSuffix()}`;
    const created = await request(app)
      .post("/api/v1/grading/assessment-types")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Devoir", nameEn: "Homework" });
    expect(created.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/v1/grading/assessment-types")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code, nameFr: "Autre", nameEn: "Other" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("ASSESSMENT_TYPE_CODE_TAKEN");
  });

  it("runs the full grade lifecycle: create, enter, publish-locks, correct-with-log", async () => {
    const { subdomain, adminToken, teacherToken } = await setUpTenantWithAdmin();
    const { academicPeriodId, classroomId, subjectId, studentIds } = await setUpClassAndStudents(
      subdomain,
      adminToken,
    );
    const [studentA, studentB] = studentIds;

    const assessmentType = await request(app)
      .post("/api/v1/grading/assessment-types")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `EXAM-${uniqueSuffix()}`, nameFr: "Examen", nameEn: "Exam" });
    const assessmentTypeId = (assessmentType.body as { id: string }).id;

    const deniedCreate = await request(app)
      .post("/api/v1/grading/assessments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subjectId, classroomId, assessmentTypeId, academicPeriodId, title: "Devoir 1", maxScore: 20 });
    expect(deniedCreate.status).toBe(403);

    const assessment = await request(app)
      .post("/api/v1/grading/assessments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId,
        classroomId,
        assessmentTypeId,
        academicPeriodId,
        title: "Devoir 1",
        maxScore: 20,
        coefficient: 2,
      });
    expect(assessment.status).toBe(201);
    const assessmentId = (assessment.body as { id: string }).id;

    const scoreTooHigh = await request(app)
      .put(`/api/v1/grading/assessments/${assessmentId}/grades`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ grades: [{ studentId: studentA, score: 25 }] });
    expect(scoreTooHigh.status).toBe(400);
    expect((scoreTooHigh.body as { code: string }).code).toBe("SCORE_EXCEEDS_MAX");

    const entered = await request(app)
      .put(`/api/v1/grading/assessments/${assessmentId}/grades`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        grades: [
          { studentId: studentA, score: 15, comment: "Bon travail" },
          { studentId: studentB, isAbsent: true },
        ],
      });
    expect(entered.status).toBe(200);
    expect((entered.body as { score: string | null }[])[0]?.score).not.toBeNull();
    expect((entered.body as { isAbsent: boolean }[])[1]?.isAbsent).toBe(true);

    const listed = await request(app)
      .get(`/api/v1/grading/assessments/${assessmentId}/grades`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(2);

    const studentGrades = await request(app)
      .get(`/api/v1/grading/students/${studentA}/grades`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(studentGrades.status).toBe(200);
    expect((studentGrades.body as unknown[]).length).toBe(1);

    const deniedPublish = await request(app)
      .post(`/api/v1/grading/assessments/${assessmentId}/publish`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(deniedPublish.status).toBe(403);

    const published = await request(app)
      .post(`/api/v1/grading/assessments/${assessmentId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(published.status).toBe(200);
    expect((published.body as { isPublished: boolean }).isPublished).toBe(true);

    const republish = await request(app)
      .post(`/api/v1/grading/assessments/${assessmentId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(republish.status).toBe(409);

    const blockedEntry = await request(app)
      .put(`/api/v1/grading/assessments/${assessmentId}/grades`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ grades: [{ studentId: studentA, score: 18 }] });
    expect(blockedEntry.status).toBe(409);
    expect((blockedEntry.body as { code: string }).code).toBe("ASSESSMENT_LOCKED");

    const gradeIdA = (listed.body as { id: string; studentId: string }[]).find(
      (g) => g.studentId === studentA,
    )?.id as string;

    const deniedCorrection = await request(app)
      .patch(`/api/v1/grading/grades/${gradeIdA}/correct`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ score: 17, reason: "Erreur d'addition" });
    expect(deniedCorrection.status).toBe(403);

    const corrected = await request(app)
      .patch(`/api/v1/grading/grades/${gradeIdA}/correct`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ score: 17, reason: "Erreur d'addition" });
    expect(corrected.status).toBe(200);
    expect(Number((corrected.body as { score: string }).score)).toBe(17);

    const changeLogs = await testAdminPrisma.gradeChangeLog.findMany({ where: { gradeId: gradeIdA } });
    expect(changeLogs.length).toBe(1);
    expect(Number(changeLogs[0]?.previousScore)).toBe(15);
    expect(Number(changeLogs[0]?.newScore)).toBe(17);
  }, 15000);
});
