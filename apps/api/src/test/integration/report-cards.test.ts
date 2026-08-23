import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("bulletins et moyennes (§21)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.reportCardItem.deleteMany({
      where: { reportCard: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.reportCard.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.grade.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.assessment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.assessmentType.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.enrollment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subjectCoefficient.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

  it("computes coefficient-weighted subject and overall averages, ranks the class, and generates a PDF bulletin", async () => {
    const { tenant, subdomain } = await createTenant("ReportCardTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("rc-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacher = await createUser("rc-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

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
    const academicPeriodId = (period.body as { id: string }).id;

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
    const gradeLevelId = (gradeLevel.body as { id: string }).id;

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        name: `6e A ${uniqueSuffix()}`,
        academicYearId,
        campusId: (campus.body as { id: string }).id,
        gradeLevelId,
        capacity: 40,
      });
    const classroomId = (classroom.body as { id: string }).id;

    const maths = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });
    const mathsId = (maths.body as { id: string }).id;

    const french = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `FR-${uniqueSuffix()}`, nameFr: "Français", nameEn: "French" });
    const frenchId = (french.body as { id: string }).id;

    // Maths weighs 3x more than French in the overall average.
    await request(app)
      .post(`/api/v1/school-config/subjects/${mathsId}/coefficients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ gradeLevelId, coefficient: 3 });
    await request(app)
      .post(`/api/v1/school-config/subjects/${frenchId}/coefficients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ gradeLevelId, coefficient: 1 });

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
      const studentId = (student.body as { id: string }).id;
      await request(app)
        .post(`/api/v1/students/${studentId}/enrollments`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-Slug", subdomain)
        .send({ classroomId, academicYearId, campusId: (campus.body as { id: string }).id, gradeLevelId });
      studentIds.push(studentId);
    }
    const [studentA, studentB] = studentIds;

    const assessmentType = await request(app)
      .post("/api/v1/grading/assessment-types")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `DEV-${uniqueSuffix()}`, nameFr: "Devoir", nameEn: "Homework" });
    const assessmentTypeId = (assessmentType.body as { id: string }).id;

    const mathsAssessment = await request(app)
      .post("/api/v1/grading/assessments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId: mathsId,
        classroomId,
        assessmentTypeId,
        academicPeriodId,
        title: "Devoir maths",
        maxScore: 20,
      });
    const mathsAssessmentId = (mathsAssessment.body as { id: string }).id;

    const frenchAssessment = await request(app)
      .post("/api/v1/grading/assessments")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId: frenchId,
        classroomId,
        assessmentTypeId,
        academicPeriodId,
        title: "Devoir français",
        maxScore: 20,
      });
    const frenchAssessmentId = (frenchAssessment.body as { id: string }).id;

    await request(app)
      .put(`/api/v1/grading/assessments/${mathsAssessmentId}/grades`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        grades: [
          { studentId: studentA, score: 18 },
          { studentId: studentB, score: 10 },
        ],
      });
    await request(app)
      .put(`/api/v1/grading/assessments/${frenchAssessmentId}/grades`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        grades: [
          { studentId: studentA, score: 12 },
          { studentId: studentB, score: 16 },
        ],
      });

    const deniedGenerate = await request(app)
      .post("/api/v1/grading/report-cards/generate")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicPeriodId });
    expect(deniedGenerate.status).toBe(403);

    const generated = await request(app)
      .post("/api/v1/grading/report-cards/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicPeriodId });
    expect(generated.status).toBe(200);
    const reportCards = generated.body as {
      id: string;
      studentId: string;
      averageScore: string;
      classRank: number;
      mention: string;
    }[];
    expect(reportCards.length).toBe(2);

    const reportCardA = reportCards.find((r) => r.studentId === studentA);
    const reportCardB = reportCards.find((r) => r.studentId === studentB);
    // Student A: (18*3 + 12*1) / 4 = 16.5 — Student B: (10*3 + 16*1) / 4 = 11.5
    expect(Number(reportCardA?.averageScore)).toBe(16.5);
    expect(reportCardA?.classRank).toBe(1);
    expect(reportCardA?.mention).toBe("Très bien");
    expect(Number(reportCardB?.averageScore)).toBe(11.5);
    expect(reportCardB?.classRank).toBe(2);
    expect(reportCardB?.mention).toBe("Passable");

    const listed = await request(app)
      .get(`/api/v1/grading/report-cards?classroomId=${classroomId}&academicPeriodId=${academicPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(2);

    const fetched = await request(app)
      .get(`/api/v1/grading/report-cards/${reportCardA?.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);
    const items = (fetched.body as { items: { subjectId: string; averageScore: string }[] }).items;
    expect(items.length).toBe(2);
    expect(Number(items.find((i) => i.subjectId === mathsId)?.averageScore)).toBe(18);
    expect(Number(items.find((i) => i.subjectId === frenchId)?.averageScore)).toBe(12);

    const pdf = await request(app)
      .get(`/api/v1/grading/report-cards/${reportCardA?.id}/pdf`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");

    // §40 : « suppression logique plutôt qu'automatique » — une suppression dure du
    // dossier élève ne doit jamais emporter son bulletin en silence. La contrainte
    // RESTRICT (jamais CASCADE) sur ReportCard.studentId le garantit désormais au
    // niveau base, indépendamment de tout code applicatif.
    await expect(testAdminPrisma.student.delete({ where: { id: studentA as string } })).rejects.toThrow();
    const stillThere = await testAdminPrisma.reportCard.findUniqueOrThrow({
      where: { id: reportCardA?.id as string },
    });
    expect(stillThere.id).toBe(reportCardA?.id);
  }, 20000);
});
