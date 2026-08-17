import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("portail élève — lecture (§26)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.reportCardItem.deleteMany({
      where: { reportCard: { student: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.reportCard.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.announcement.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetableEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetable.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentUserLink.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationCode.deleteMany({
      where: { invitation: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationInvitation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.enrollment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subject.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicPeriod.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("expose profil, emploi du temps, bulletins, annonces et reçus d'un élève lié — et refuse le reste", async () => {
    const { tenant, subdomain } = await createTenant("StudentPortalTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("stuportal-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const studentUser = await createUser("stuportal-student");
    const studentToken = signAccessToken({ sub: studentUser.id });

    const stranger = await createUser("stuportal-stranger");
    const strangerToken = signAccessToken({ sub: stranger.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Agent comptable",
        userId: admin.id,
      });

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
      .send({ name: `6e A ${uniqueSuffix()}`, academicYearId, campusId, gradeLevelId, capacity: 40 });
    const classroomId = (classroom.body as { id: string }).id;

    const subject = await request(app)
      .post("/api/v1/school-config/subjects")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `MATH-${uniqueSuffix()}`, nameFr: "Mathématiques", nameEn: "Mathematics" });
    const subjectId = (subject.body as { id: string }).id;

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

    // Rattachement STUDENT via le vrai flux d'activation (§8) plutôt qu'un insert
    // direct — vérifie que StudentUserLink.tenantId reste correctement posé.
    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "STUDENT", invitedEmail: studentUser.email });
    const { code } = invitation.body as { code: string };
    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ code });
    expect(redeemed.status).toBe(200);

    const timetable = await request(app)
      .post("/api/v1/school-config/timetables")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicYearId });
    const teacherEmployee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
      });
    await request(app)
      .post(`/api/v1/school-config/timetables/${(timetable.body as { id: string }).id}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId,
        teacherEmployeeId: (teacherEmployee.body as { id: string }).id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
      });

    const reportCard = await testAdminPrisma.reportCard.create({
      data: { tenantId: tenant.id, studentId, academicPeriodId, averageScore: 14.25, classRank: 2 },
    });

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Scolarité", amountCents: 80_000 }] });
    const invoiceId = (invoice.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    const payment = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 30_000 });
    const receiptId = (payment.body as { receipt: { id: string } }).receipt.id;

    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Rentrée", body: "La rentrée aura lieu le 2 septembre." });
    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Sortie 6e A", body: "Sortie au musée.", audienceScope: "CLASSROOM", classroomId });
    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Réunion parents", body: "Réservé aux parents.", audienceScope: "PARENTS" });
    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Réunion personnel", body: "Réunion interne.", audienceScope: "STAFF" });

    // Un étranger sans lien vérifié est refusé.
    const deniedStranger = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/profile`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(deniedStranger.status).toBe(403);
    expect((deniedStranger.body as { code: string }).code).toBe("STUDENT_LINK_NOT_VERIFIED");

    const linkedStudents = await request(app)
      .get("/api/v1/family/linked-students")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(linkedStudents.status).toBe(200);
    expect(
      (linkedStudents.body as { student: { id: string } }[]).some((s) => s.student.id === studentId),
    ).toBe(true);

    const profile = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/profile`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(profile.status).toBe(200);
    expect((profile.body as { student: { id: string } }).student.id).toBe(studentId);
    expect(
      (profile.body as { currentEnrollment: { classroomId: string } }).currentEnrollment.classroomId,
    ).toBe(classroomId);

    const timetableEntries = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/timetable`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(timetableEntries.status).toBe(200);
    expect((timetableEntries.body as { subjectId: string }[]).some((e) => e.subjectId === subjectId)).toBe(
      true,
    );

    // §18 "Élève" : bundle des mêmes données, sans abonnement (aucun n'a été créé ici).
    const dashboard = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/dashboard`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(dashboard.status).toBe(200);
    const dashboardBody = dashboard.body as {
      profile: { student: { id: string } };
      recentReportCards: { id: string }[];
      subscription: unknown;
    };
    expect(dashboardBody.profile.student.id).toBe(studentId);
    expect(dashboardBody.recentReportCards.some((r) => r.id === reportCard.id)).toBe(true);
    expect(dashboardBody.subscription).toBeNull();

    const reportCards = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/report-cards`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(reportCards.status).toBe(200);
    expect((reportCards.body as { id: string }[]).some((r) => r.id === reportCard.id)).toBe(true);

    const reportCardPdf = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/report-cards/${reportCard.id}/pdf`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(reportCardPdf.status).toBe(200);
    expect(reportCardPdf.headers["content-type"]).toBe("application/pdf");

    const announcements = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/announcements`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(announcements.status).toBe(200);
    const titles = (announcements.body as { title: string }[]).map((a) => a.title);
    expect(titles).toContain("Rentrée");
    expect(titles).toContain("Sortie 6e A");
    expect(titles).not.toContain("Réunion parents");
    expect(titles).not.toContain("Réunion personnel");

    const receipts = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/receipts`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(receipts.status).toBe(200);
    expect((receipts.body as { id: string }[]).some((r) => r.id === receiptId)).toBe(true);

    const receiptPdf = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/receipts/${receiptId}/pdf`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(receiptPdf.status).toBe(200);
    expect(receiptPdf.headers["content-type"]).toBe("application/pdf");

    // Un second élève, lié à un autre compte, ne doit jamais exposer les données du premier.
    const otherStudent = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Boris", lastName: "Ekani" });
    const otherStudentId = (otherStudent.body as { id: string }).id;
    const otherStudentUser = await createUser("stuportal-other");
    const otherStudentToken = signAccessToken({ sub: otherStudentUser.id });
    const otherInvitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: otherStudentId,
        beneficiaryCategory: "STUDENT",
        invitedEmail: otherStudentUser.email,
      });
    await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ code: (otherInvitation.body as { code: string }).code });

    const crossStudentReportCard = await request(app)
      .get(`/api/v1/student-portal/students/${otherStudentId}/report-cards/${reportCard.id}`)
      .set("Authorization", `Bearer ${otherStudentToken}`);
    expect(crossStudentReportCard.status).toBe(404);

    const crossStudentReceipt = await request(app)
      .get(`/api/v1/student-portal/students/${otherStudentId}/receipts/${receiptId}/pdf`)
      .set("Authorization", `Bearer ${otherStudentToken}`);
    expect(crossStudentReceipt.status).toBe(404);
  }, 30000);
});
