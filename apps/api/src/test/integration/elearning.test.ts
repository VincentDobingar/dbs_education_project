import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("e-learning — cours en ligne et suivi de progression (§29)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.resourceProgress.deleteMany({
      where: { resource: { course: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.courseResource.deleteMany({
      where: { course: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.onlineCourse.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentUserLink.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationCode.deleteMany({
      where: { invitation: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationInvitation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.teacherAssignment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.enrollment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpClassroom() {
    const { tenant, subdomain } = await createTenant("ElearningTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("el-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("el-teacher");
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    // SCHOOL_ADMIN a elearning.read mais pas elearning.write — sert à vérifier le
    // moindre privilège sans passer par un rôle qui n'a même pas la lecture.
    const readOnlyUser = await createUser("el-readonly");
    await addMembership(readOnlyUser.id, tenant.id);
    await grantRole(readOnlyUser.id, "SCHOOL_ADMIN", tenant.id);
    const readOnlyToken = signAccessToken({ sub: readOnlyUser.id });

    const teacherEmployee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
        userId: teacherUser.id,
      });
    const teacherEmployeeId = (teacherEmployee.body as { id: string }).id;

    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });
    const campusId = (campus.body as { id: string }).id;

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
    const gradeLevelId = (gradeLevel.body as { id: string }).id;

    const classroom = await request(app)
      .post("/api/v1/school-config/classrooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `6e A ${uniqueSuffix()}`, academicYearId, campusId, gradeLevelId, capacity: 40 });
    const classroomId = (classroom.body as { id: string }).id;

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });
    const subjectId = (subject.body as { id: string }).id;

    await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeId: teacherEmployeeId, subjectId, classroomId, academicYearId });

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Awa", lastName: "Ngo" });
    const studentId = (student.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/students/${studentId}/enrollments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, classroomId, campusId, gradeLevelId });

    const studentUser = await createUser("el-student");
    const studentToken = signAccessToken({ sub: studentUser.id });
    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "STUDENT", invitedEmail: studentUser.email });
    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ code: (invitation.body as { code: string }).code });
    expect(redeemed.status).toBe(200);

    return {
      subdomain,
      adminToken,
      teacherToken,
      readOnlyToken,
      teacherEmployeeId,
      classroomId,
      subjectId,
      studentId,
      studentToken,
    };
  }

  it("lets a teacher build a course with resources, refuses a role without elearning.write, and supports the full CRUD cycle", async () => {
    const { subdomain, adminToken, teacherToken, readOnlyToken, classroomId, subjectId, teacherEmployeeId } =
      await setUpClassroom();

    const denied = await request(app)
      .post("/api/v1/elearning/courses")
      .set("Authorization", `Bearer ${readOnlyToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Les fractions" });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/elearning/courses")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Les fractions", description: "Introduction aux fractions" });
    expect(created.status).toBe(201);
    const courseBody = created.body as { id: string; createdByEmployeeId: string };
    expect(courseBody.createdByEmployeeId).toBe(teacherEmployeeId);
    const courseId = courseBody.id;

    const invalidResource = await request(app)
      .post(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Vidéo introductive", type: "VIDEO" });
    expect(invalidResource.status).toBe(400);

    const videoResource = await request(app)
      .post(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        title: "Vidéo introductive",
        type: "VIDEO",
        url: "https://videos.example.test/fractions.mp4",
        order: 1,
      });
    expect(videoResource.status).toBe(201);
    const videoResourceId = (videoResource.body as { id: string }).id;

    const textResource = await request(app)
      .post(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        title: "Résumé",
        type: "TEXT",
        content: "Une fraction représente une partie d'un tout.",
        order: 2,
      });
    expect(textResource.status).toBe(201);

    const listedResources = await request(app)
      .get(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedResources.status).toBe(200);
    expect((listedResources.body as { id: string }[]).map((r) => r.id)).toEqual([
      videoResourceId,
      (textResource.body as { id: string }).id,
    ]);

    const listed = await request(app)
      .get(`/api/v1/elearning/courses?classroomId=${classroomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((c) => c.id === courseId)).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/elearning/courses/${courseId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Les fractions (mise à jour)" });
    expect(updated.status).toBe(200);
    expect((updated.body as { title: string }).title).toBe("Les fractions (mise à jour)");

    const removedResource = await request(app)
      .delete(`/api/v1/elearning/courses/${courseId}/resources/${videoResourceId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removedResource.status).toBe(204);

    const resourcesAfterRemoval = await request(app)
      .get(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((resourcesAfterRemoval.body as unknown[]).length).toBe(1);

    const cancelled = await request(app)
      .delete(`/api/v1/elearning/courses/${courseId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(cancelled.status).toBe(204);

    const afterCancel = await request(app)
      .get(`/api/v1/elearning/courses/${courseId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(afterCancel.status).toBe(404);
  }, 30000);

  it("lets a linked student browse their classroom's courses and mark resources complete, never reaching another classroom's course", async () => {
    const { subdomain, teacherToken, classroomId, subjectId, studentId, studentToken } =
      await setUpClassroom();

    const course = await request(app)
      .post("/api/v1/elearning/courses")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Les fractions" });
    const courseId = (course.body as { id: string }).id;

    const resource = await request(app)
      .post(`/api/v1/elearning/courses/${courseId}/resources`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Résumé", type: "TEXT", content: "Une fraction représente une partie d'un tout." });
    const resourceId = (resource.body as { id: string }).id;

    const stranger = await createUser("el-stranger");
    const strangerToken = signAccessToken({ sub: stranger.id });
    const deniedStranger = await request(app)
      .get(`/api/v1/elearning/student/${studentId}/courses`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(deniedStranger.status).toBe(403);
    expect((deniedStranger.body as { code: string }).code).toBe("STUDENT_LINK_NOT_VERIFIED");

    const listedForStudent = await request(app)
      .get(`/api/v1/elearning/student/${studentId}/courses`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(listedForStudent.status).toBe(200);
    expect((listedForStudent.body as { id: string }[]).some((c) => c.id === courseId)).toBe(true);

    const courseDetail = await request(app)
      .get(`/api/v1/elearning/student/${studentId}/courses/${courseId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(courseDetail.status).toBe(200);
    const detailBody = courseDetail.body as {
      resources: { id: string }[];
      completedResourceIds: string[];
    };
    expect(detailBody.resources.map((r) => r.id)).toContain(resourceId);
    expect(detailBody.completedResourceIds).toEqual([]);

    const completed = await request(app)
      .post(`/api/v1/elearning/student/${studentId}/courses/${courseId}/resources/${resourceId}/complete`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(completed.status).toBe(200);

    // Idempotent : marquer à nouveau met juste à jour la date, jamais un doublon.
    const completedAgain = await request(app)
      .post(`/api/v1/elearning/student/${studentId}/courses/${courseId}/resources/${resourceId}/complete`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(completedAgain.status).toBe(200);
    expect((completedAgain.body as { id: string }).id).toBe((completed.body as { id: string }).id);

    const courseDetailAfterCompletion = await request(app)
      .get(`/api/v1/elearning/student/${studentId}/courses/${courseId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(
      (courseDetailAfterCompletion.body as { completedResourceIds: string[] }).completedResourceIds,
    ).toEqual([resourceId]);

    // Le professeur (côté staff) voit qui a progressé.
    const progress = await request(app)
      .get(`/api/v1/elearning/courses/${courseId}/progress`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(progress.status).toBe(200);
    expect((progress.body as { studentId: string }[]).some((p) => p.studentId === studentId)).toBe(true);

    // Un cours d'une autre classe reste introuvable pour cet élève (404, pas 403).
    const otherClassroom = await setUpClassroom();
    const otherCourse = await request(app)
      .post("/api/v1/elearning/courses")
      .set("Authorization", `Bearer ${otherClassroom.teacherToken}`)
      .set("X-Tenant-Slug", otherClassroom.subdomain)
      .send({
        classroomId: otherClassroom.classroomId,
        subjectId: otherClassroom.subjectId,
        title: "Cours autre classe",
      });
    const crossClassroomAttempt = await request(app)
      .get(`/api/v1/elearning/student/${studentId}/courses/${(otherCourse.body as { id: string }).id}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(crossClassroomAttempt.status).toBe(404);
  }, 30000);
});
