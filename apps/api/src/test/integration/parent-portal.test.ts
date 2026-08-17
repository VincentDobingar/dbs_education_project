import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createTenant,
  createUser,
  createVerifiedRelationship,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("portail parent — lecture (§25)", () => {
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
    await testAdminPrisma.attendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetableEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetable.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.enrollment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
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

  it("expose présences, bulletins, emploi du temps, annonces, finances d'un enfant vérifié — et refuse le reste", async () => {
    const { tenant, subdomain } = await createTenant("PortalTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("portal-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacher = await createUser("portal-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const parent = await createUser("portal-parent");
    const parentToken = signAccessToken({ sub: parent.id });

    const stranger = await createUser("portal-stranger");
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

    await createVerifiedRelationship(parent.id, studentId, tenant.id);

    const timetable = await request(app)
      .post("/api/v1/school-config/timetables")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicYearId });
    await request(app)
      .post(`/api/v1/school-config/timetables/${(timetable.body as { id: string }).id}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId,
        teacherEmployeeId,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
        roomLabel: "Salle 3",
      });

    await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, date: "2025-10-01", entries: [{ studentId, status: "ABSENT" }] });

    const reportCard = await testAdminPrisma.reportCard.create({
      data: { tenantId: tenant.id, studentId, academicPeriodId, averageScore: 15.5, classRank: 1 },
    });

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Scolarité", amountCents: 100_000 }] });
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
      .send({ amountCents: 40_000 });
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
      .send({ title: "Réunion personnel", body: "Réunion interne.", audienceScope: "STAFF" });
    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Annonce expirée", body: "Ne doit pas apparaître.", expiresAt: "2020-01-01" });
    await request(app)
      .post("/api/v1/communication/announcements")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Annonce future", body: "Pas encore publiée.", publishedAt: "2999-01-01" });

    // Un étranger sans relation vérifiée est refusé.
    const deniedStranger = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/attendance`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(deniedStranger.status).toBe(403);
    expect((deniedStranger.body as { code: string }).code).toBe("STUDENT_RELATIONSHIP_NOT_VERIFIED");

    const attendance = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/attendance`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(attendance.status).toBe(200);
    expect((attendance.body as { status: string }[]).some((a) => a.status === "ABSENT")).toBe(true);

    // §18 "Parent" : agrège tous les enfants vérifiés en un seul appel, chacun sous
    // son propre verrouillage de tenant — un étranger n'a bien sûr aucun enfant.
    const strangerDashboard = await request(app)
      .get("/api/v1/parent-portal/dashboard")
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(strangerDashboard.status).toBe(200);
    expect(strangerDashboard.body).toEqual([]);

    const parentDashboard = await request(app)
      .get("/api/v1/parent-portal/dashboard")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(parentDashboard.status).toBe(200);
    const dashboardChildren = parentDashboard.body as {
      student: { id: string };
      tenantName: string;
      recentAttendance: { status: string }[];
    }[];
    const childDashboard = dashboardChildren.find((c) => c.student.id === studentId);
    expect(childDashboard).toBeTruthy();
    expect(childDashboard?.tenantName).toBe(tenant.name);
    expect(childDashboard?.recentAttendance.some((a) => a.status === "ABSENT")).toBe(true);

    const reportCards = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/report-cards`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(reportCards.status).toBe(200);
    expect((reportCards.body as { id: string }[]).some((r) => r.id === reportCard.id)).toBe(true);

    const reportCardDetail = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/report-cards/${reportCard.id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(reportCardDetail.status).toBe(200);

    const reportCardPdf = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/report-cards/${reportCard.id}/pdf`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(reportCardPdf.status).toBe(200);
    expect(reportCardPdf.headers["content-type"]).toBe("application/pdf");

    const timetableEntries = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/timetable`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(timetableEntries.status).toBe(200);
    expect((timetableEntries.body as { subjectId: string }[]).some((e) => e.subjectId === subjectId)).toBe(
      true,
    );

    const announcements = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/announcements`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(announcements.status).toBe(200);
    const titles = (announcements.body as { title: string }[]).map((a) => a.title);
    expect(titles).toContain("Rentrée");
    expect(titles).toContain("Sortie 6e A");
    expect(titles).not.toContain("Réunion personnel");
    expect(titles).not.toContain("Annonce expirée");
    expect(titles).not.toContain("Annonce future");

    const financialSituation = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/finance/situation`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(financialSituation.status).toBe(200);
    expect((financialSituation.body as { outstandingCents: number }).outstandingCents).toBe(60_000);

    const receiptPdf = await request(app)
      .get(`/api/v1/parent-portal/children/${studentId}/receipts/${receiptId}/pdf`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(receiptPdf.status).toBe(200);
    expect(receiptPdf.headers["content-type"]).toBe("application/pdf");

    // Un autre élève, sans lien avec ce reçu/bulletin, ne doit jamais les exposer via ce studentId.
    const otherStudent = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Boris", lastName: "Ekani" });
    const otherStudentId = (otherStudent.body as { id: string }).id;
    await createVerifiedRelationship(parent.id, otherStudentId, tenant.id);

    const crossStudentReportCard = await request(app)
      .get(`/api/v1/parent-portal/children/${otherStudentId}/report-cards/${reportCard.id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(crossStudentReportCard.status).toBe(404);

    const crossStudentReceipt = await request(app)
      .get(`/api/v1/parent-portal/children/${otherStudentId}/receipts/${receiptId}/pdf`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(crossStudentReceipt.status).toBe(404);
  }, 30000);
});
