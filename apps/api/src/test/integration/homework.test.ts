import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createSubscription,
  createTenant,
  createUser,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("devoirs et dépôt de travaux (§18/§21/§25/§26)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdSubscribedStudentIds: string[] = [];
  const createdParentUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.subscription.deleteMany({
      where: {
        owner: {
          OR: [
            { studentId: { in: createdSubscribedStudentIds } },
            { familyAccount: { primaryUserId: { in: createdParentUserIds } } },
          ],
        },
      },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({
      where: {
        OR: [
          { studentId: { in: createdSubscribedStudentIds } },
          { familyAccount: { primaryUserId: { in: createdParentUserIds } } },
        ],
      },
    });
    await testAdminPrisma.familyAccount.deleteMany({
      where: { primaryUserId: { in: createdParentUserIds } },
    });
    await testAdminPrisma.homeworkSubmission.deleteMany({
      where: { homework: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.homework.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
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
    const { tenant, subdomain } = await createTenant("HomeworkTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("hw-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("hw-teacher");
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    // SCHOOL_ADMIN a homework.read mais pas homework.write — sert à vérifier le
    // moindre privilège sans passer par un rôle qui n'a même pas la lecture.
    const readOnlyUser = await createUser("hw-readonly");
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

    const studentUser = await createUser("hw-student");
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

    const parentUser = await createUser("hw-parent");
    const parentToken = signAccessToken({ sub: parentUser.id });
    const parentInvitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT", invitedEmail: parentUser.email });
    const parentRedeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: (parentInvitation.body as { code: string }).code });
    expect(parentRedeemed.status).toBe(200);

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
      parentToken,
      parentUserId: parentUser.id,
    };
  }

  it("lets a teacher assign homework, refuses a role without homework.write, and supports the full CRUD cycle", async () => {
    const { subdomain, adminToken, teacherToken, readOnlyToken, classroomId, subjectId, teacherEmployeeId } =
      await setUpClassroom();

    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const denied = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${readOnlyToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Exercices chapitre 3", dueAt });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        subjectId,
        title: "Exercices chapitre 3",
        instructions: "Faire les exercices 1 à 5 page 42",
        dueAt,
      });
    expect(created.status).toBe(201);
    const homeworkBody = created.body as { id: string; createdByEmployeeId: string };
    expect(homeworkBody.createdByEmployeeId).toBe(teacherEmployeeId);
    const homeworkId = homeworkBody.id;

    const listed = await request(app)
      .get(`/api/v1/homework?classroomId=${classroomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((h) => h.id === homeworkId)).toBe(true);

    const fetched = await request(app)
      .get(`/api/v1/homework/${homeworkId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetched.status).toBe(200);
    expect((fetched.body as { title: string }).title).toBe("Exercices chapitre 3");

    const updated = await request(app)
      .patch(`/api/v1/homework/${homeworkId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Exercices chapitre 3 (corrigé)" });
    expect(updated.status).toBe(200);
    expect((updated.body as { title: string }).title).toBe("Exercices chapitre 3 (corrigé)");

    const cancelled = await request(app)
      .delete(`/api/v1/homework/${homeworkId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(cancelled.status).toBe(204);

    const afterCancel = await request(app)
      .get(`/api/v1/homework/${homeworkId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(afterCancel.status).toBe(404);

    const listedAfterCancel = await request(app)
      .get(`/api/v1/homework?classroomId=${classroomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedAfterCancel.body as { id: string }[]).some((h) => h.id === homeworkId)).toBe(false);

    // §18 : le tableau de bord enseignant expose désormais les devoirs à venir.
    const secondDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const secondHomework = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Rédaction", dueAt: secondDueAt });
    const teacherDashboard = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(teacherDashboard.status).toBe(200);
    expect(
      (teacherDashboard.body as { upcomingHomework: { id: string }[] }).upcomingHomework.some(
        (h) => h.id === (secondHomework.body as { id: string }).id,
      ),
    ).toBe(true);
  }, 30000);

  it("lets a linked student view and submit their classroom's homework, upserts a resubmission, and never reaches another classroom's homework", async () => {
    const {
      subdomain,
      teacherToken,
      classroomId,
      subjectId,
      studentId,
      studentToken,
      parentToken,
      parentUserId,
    } = await setUpClassroom();

    const futureDueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const pastDueAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const onTimeHomework = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Devoir à temps", dueAt: futureDueAt });
    const onTimeHomeworkId = (onTimeHomework.body as { id: string }).id;

    const lateHomework = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, subjectId, title: "Devoir en retard", dueAt: pastDueAt });
    const lateHomeworkId = (lateHomework.body as { id: string }).id;

    const stranger = await createUser("hw-stranger");
    const strangerToken = signAccessToken({ sub: stranger.id });
    const deniedStranger = await request(app)
      .get(`/api/v1/homework/student/${studentId}`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(deniedStranger.status).toBe(403);
    expect((deniedStranger.body as { code: string }).code).toBe("STUDENT_LINK_NOT_VERIFIED");

    // §37 : un élève lié mais sans abonnement individuel actif reste bloqué.
    const deniedNoSubscription = await request(app)
      .get(`/api/v1/homework/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(deniedNoSubscription.status).toBe(402);
    expect((deniedNoSubscription.body as { code: string }).code).toBe("SUBSCRIPTION_INACTIVE");

    createdSubscribedStudentIds.push(studentId);
    await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");

    const listedForStudent = await request(app)
      .get(`/api/v1/homework/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(listedForStudent.status).toBe(200);
    const listedIds = (listedForStudent.body as { id: string }[]).map((h) => h.id);
    expect(listedIds).toEqual(expect.arrayContaining([onTimeHomeworkId, lateHomeworkId]));

    // §25/§37 : le parent consulte aussi les devoirs de son enfant, en lecture seule —
    // exige un abonnement familial actif, comme toute autre route du portail parent.
    createdParentUserIds.push(parentUserId);
    const parentFamilyAccount = await testAdminPrisma.familyAccount.create({
      data: { primaryUserId: parentUserId },
    });
    await createSubscription({ familyAccountId: parentFamilyAccount.id }, "PARENT", "PARENT_BASIC", "ACTIVE");

    const listedForParent = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/homework`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(listedForParent.status).toBe(200);
    expect((listedForParent.body as { id: string }[]).map((h) => h.id)).toEqual(
      expect.arrayContaining([onTimeHomeworkId, lateHomeworkId]),
    );

    const invalidSubmission = await request(app)
      .post(`/api/v1/homework/student/${studentId}/${onTimeHomeworkId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({});
    expect(invalidSubmission.status).toBe(400);

    const onTimeSubmission = await request(app)
      .post(`/api/v1/homework/student/${studentId}/${onTimeHomeworkId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ content: "Voici ma réponse" });
    expect(onTimeSubmission.status).toBe(200);
    const onTimeSubmissionBody = onTimeSubmission.body as { id: string; status: string; content: string };
    expect(onTimeSubmissionBody.status).toBe("ON_TIME");

    const lateSubmission = await request(app)
      .post(`/api/v1/homework/student/${studentId}/${lateHomeworkId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ fileUrl: "https://files.example.test/devoir.pdf" });
    expect(lateSubmission.status).toBe(200);
    expect((lateSubmission.body as { status: string }).status).toBe("LATE");

    // Redépôt : met à jour la soumission existante, jamais un doublon.
    const resubmitted = await request(app)
      .post(`/api/v1/homework/student/${studentId}/${onTimeHomeworkId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ content: "Réponse corrigée" });
    expect(resubmitted.status).toBe(200);
    const resubmittedBody = resubmitted.body as { id: string; content: string };
    expect(resubmittedBody.id).toBe(onTimeSubmissionBody.id);
    expect(resubmittedBody.content).toBe("Réponse corrigée");

    const mySubmission = await request(app)
      .get(`/api/v1/homework/student/${studentId}/${onTimeHomeworkId}/submission`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(mySubmission.status).toBe(200);
    expect((mySubmission.body as { content: string }).content).toBe("Réponse corrigée");

    // Le professeur (côté staff) voit qui a soumis.
    const submissions = await request(app)
      .get(`/api/v1/homework/${onTimeHomeworkId}/submissions`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(submissions.status).toBe(200);
    expect((submissions.body as { studentId: string }[]).some((s) => s.studentId === studentId)).toBe(true);

    // Un devoir d'une autre classe (ici : id inexistant côté ce dossier élève) reste
    // introuvable — jamais confirmé (404, pas 403).
    const otherClassroom = await setUpClassroom();
    const otherClassroomHomework = await request(app)
      .post("/api/v1/homework")
      .set("Authorization", `Bearer ${otherClassroom.teacherToken}`)
      .set("X-Tenant-Slug", otherClassroom.subdomain)
      .send({
        classroomId: otherClassroom.classroomId,
        subjectId: otherClassroom.subjectId,
        title: "Devoir autre classe",
        dueAt: futureDueAt,
      });
    const crossClassroomAttempt = await request(app)
      .get(
        `/api/v1/homework/student/${studentId}/${(otherClassroomHomework.body as { id: string }).id}/submission`,
      )
      .set("Authorization", `Bearer ${studentToken}`);
    expect(crossClassroomAttempt.status).toBe(404);

    // §26 : le tableau de bord élève expose les devoirs à venir (pas ceux déjà échus).
    const studentDashboard = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/dashboard`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentDashboard.status).toBe(200);
    const dashboardHomeworkIds = (
      studentDashboard.body as { upcomingHomework: { id: string }[] }
    ).upcomingHomework.map((h) => h.id);
    expect(dashboardHomeworkIds).toContain(onTimeHomeworkId);
    expect(dashboardHomeworkIds).not.toContain(lateHomeworkId);
  }, 30000);
});
