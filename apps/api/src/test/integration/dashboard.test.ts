import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("tableaux de bord (§18)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.announcement.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.disciplinaryIncident.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.attendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.reportCard.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.expense.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.expenseCategory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetableEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.timetable.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.teacherAssignment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

  it("agrège direction/comptable/enseignant — moindre privilège respecté, auto-scopage enseignant", async () => {
    const { tenant, subdomain } = await createTenant("DashboardTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("dash-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const accountant = await createUser("dash-accountant");
    await addMembership(accountant.id, tenant.id);
    await grantRole(accountant.id, "ACCOUNTANT", tenant.id);
    const accountantToken = signAccessToken({ sub: accountant.id });

    const teacherUser = await createUser("dash-teacher");
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Directrice",
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

    await request(app)
      .post("/api/v1/school-config/teacher-assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeId: teacherEmployeeId, subjectId, classroomId, academicYearId });

    const todayDayOfWeek = (new Date().getUTCDay() + 6) % 7;
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
        dayOfWeek: todayDayOfWeek,
        startTime: "08:00",
        endTime: "09:00",
      });

    const student1 = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Awa", lastName: "Ngo", gender: "F" });
    const student1Id = (student1.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/students/${student1Id}/enrollments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, classroomId, campusId, gradeLevelId });

    const student2 = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Boris", lastName: "Ekani", gender: "M" });
    const student2Id = (student2.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/students/${student2Id}/enrollments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ academicYearId, classroomId, campusId, gradeLevelId });

    // L'enseignant fait l'appel pour la matière du jour — sa classe ne doit plus
    // apparaître dans "classesNeedingRollCall" pour son propre tableau de bord.
    const today = new Date().toISOString().slice(0, 10);
    await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        subjectId,
        date: today,
        entries: [
          { studentId: student1Id, status: "PRESENT" },
          { studentId: student2Id, status: "ABSENT" },
        ],
      });

    // SCHOOL_OWNER a discipline.read mais pas discipline.write (seul TEACHER/SUPERVISOR
    // l'ont — voir ROLE_PERMISSIONS) : l'incident est créé par l'enseignant.
    const incident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student2Id, occurredAt: today, description: "Retard répété", severity: "MINOR" });
    expect(incident.status).toBe(201);

    await testAdminPrisma.reportCard.create({
      data: { tenantId: tenant.id, studentId: student1Id, academicPeriodId, averageScore: 15.5 },
    });

    const invoice = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student1Id,
        academicYearId,
        items: [{ description: "Scolarité annuelle", amountCents: 100_000 }],
      });
    const invoiceId = (invoice.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/issue`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 40_000 });

    const expenseCategory = await request(app)
      .post("/api/v1/finance/expense-categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ code: `SUPPLIES-${uniqueSuffix()}`, nameFr: "Fournitures", nameEn: "Supplies" });
    await request(app)
      .post("/api/v1/finance/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        categoryId: (expenseCategory.body as { id: string }).id,
        description: "Papier",
        amountCents: 15_000,
        expenseDate: today,
      });

    // --- Direction : finance.read + discipline.read (SCHOOL_OWNER/DIRECTOR/TENANT_AUDITOR, pas ACCOUNTANT) ---
    const directionDeniedForAccountant = await request(app)
      .get("/api/v1/dashboard/direction")
      .set("Authorization", `Bearer ${accountantToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(directionDeniedForAccountant.status).toBe(403);

    const direction = await request(app)
      .get("/api/v1/dashboard/direction")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(direction.status).toBe(200);
    const directionBody = direction.body as {
      students: { total: number; byClassroom: { classroomId: string; count: number }[] };
      attendance: { presentCount: number; totalCount: number };
      finance: { totalPaidCents: number; overdueInvoiceCount: number };
      discipline: { recentIncidentCount: number };
    };
    expect(directionBody.students.total).toBeGreaterThanOrEqual(2);
    expect(directionBody.students.byClassroom.some((c) => c.classroomId === classroomId)).toBe(true);
    expect(directionBody.attendance.totalCount).toBeGreaterThanOrEqual(2);
    expect(directionBody.finance.totalPaidCents).toBeGreaterThanOrEqual(40_000);
    expect(directionBody.discipline.recentIncidentCount).toBeGreaterThanOrEqual(1);

    // --- Comptable : finance.read seul (ACCOUNTANT y accède) ---
    const comptable = await request(app)
      .get("/api/v1/dashboard/comptable")
      .set("Authorization", `Bearer ${accountantToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(comptable.status).toBe(200);
    const comptableBody = comptable.body as {
      today: { revenue: { grossRevenueCents: number } };
      invoices: { unpaidCount: number; unpaidCents: number };
    };
    expect(comptableBody.today.revenue.grossRevenueCents).toBeGreaterThanOrEqual(40_000);
    expect(comptableBody.invoices.unpaidCount).toBeGreaterThanOrEqual(1);
    expect(comptableBody.invoices.unpaidCents).toBeGreaterThanOrEqual(60_000);

    // --- Enseignant : auto-scopé par l'Employee lié, refusé sans fiche liée ---
    const teacherDeniedForAdminWithoutOwnAssignments = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    // L'admin A une fiche employé liée (créée plus haut) — son tableau de bord existe,
    // simplement vide (aucune classe qui lui est affectée).
    expect(teacherDeniedForAdminWithoutOwnAssignments.status).toBe(200);
    expect(
      (teacherDeniedForAdminWithoutOwnAssignments.body as { classAssignments: unknown[] }).classAssignments,
    ).toEqual([]);

    const teacherDashboard = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(teacherDashboard.status).toBe(200);
    const teacherBody = teacherDashboard.body as {
      employeeId: string;
      classAssignments: { classroomId: string }[];
      todayClasses: { subjectId: string }[];
      classesNeedingRollCall: { classroomId: string }[];
    };
    expect(teacherBody.employeeId).toBe(teacherEmployeeId);
    expect(teacherBody.classAssignments.some((a) => a.classroomId === classroomId)).toBe(true);
    expect(teacherBody.todayClasses.some((c) => c.subjectId === subjectId)).toBe(true);
    // Déjà fait l'appel pour cette classe/matière aujourd'hui — ne doit plus apparaître.
    expect(teacherBody.classesNeedingRollCall.some((c) => c.classroomId === classroomId)).toBe(false);

    // teacher-dashboard.service.ts ne filtrait ni publishedAt ni expiresAt sur les
    // annonces staff-facing, contrairement à listAnnouncementsForStudent
    // (announcement.service.ts) qui les filtre déjà pour parents/élèves — une annonce
    // planifiée pour plus tard ou déjà expirée restait donc visible ici indéfiniment.
    await testAdminPrisma.announcement.create({
      data: {
        tenantId: tenant.id,
        title: "Annonce future",
        body: "Ne doit pas encore être visible",
        audienceScope: "TEACHERS",
        createdByUserId: admin.id,
        publishedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await testAdminPrisma.announcement.create({
      data: {
        tenantId: tenant.id,
        title: "Annonce expirée",
        body: "Ne doit plus être visible",
        audienceScope: "ALL",
        createdByUserId: admin.id,
        publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const currentAnnouncement = await testAdminPrisma.announcement.create({
      data: {
        tenantId: tenant.id,
        title: "Annonce en cours",
        body: "Doit être visible",
        audienceScope: "ALL",
        createdByUserId: admin.id,
        publishedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const teacherDashboardAfterAnnouncements = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(teacherDashboardAfterAnnouncements.status).toBe(200);
    const announcementTitles = (
      teacherDashboardAfterAnnouncements.body as { announcements: { title: string }[] }
    ).announcements.map((a) => a.title);
    expect(announcementTitles).toContain(currentAnnouncement.title);
    expect(announcementTitles).not.toContain("Annonce future");
    expect(announcementTitles).not.toContain("Annonce expirée");

    const teacherDeniedForStranger = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${signAccessToken({ sub: (await createUser("dash-stranger")).id })}`)
      .set("X-Tenant-Slug", subdomain);
    expect(teacherDeniedForStranger.status).toBe(403);

    // Enseignant licencié (fiche archivée) mais dont le rôle tenant n'a pas été
    // séparément révoqué — ne doit plus pouvoir consulter son ancien tableau de bord
    // sous son identité employé désormais retirée (même garde que resolveActingEmployeeId).
    await request(app)
      .post(`/api/v1/employees/${teacherEmployeeId}/archive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    const teacherDashboardAfterTermination = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(teacherDashboardAfterTermination.status).toBe(403);
    expect((teacherDashboardAfterTermination.body as { code: string }).code).toBe("EMPLOYEE_RECORD_REQUIRED");
  }, 30000);

  // setCurrentAcademicYear (academic-year.service.ts) bascule isCurrent d'une annee a
  // l'autre, mais TeacherAssignment/TimetableEntry de l'ancienne annee ne sont jamais
  // purges -- sans filtrage sur l'annee courante, le tableau de bord enseignant
  // continuait de resoudre un creneau d'une annee scolaire revolue comme si c'etait
  // toujours d'actualite aujourd'hui.
  it("stops surfacing a teacher's prior-academic-year timetable/assignments once a new year becomes current", async () => {
    const { tenant, subdomain } = await createTenant("DashboardStaleYearTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("stale-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("stale-teacher");
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    const teacherEmployee = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Omar",
        lastName: "Sy",
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

    const oldYear = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Old-${uniqueSuffix()}`, startDate: "2024-09-01", endDate: "2025-06-30" });
    const oldYearId = (oldYear.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/school-config/academic-years/${oldYearId}/set-current`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

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
        name: `6e Old ${uniqueSuffix()}`,
        academicYearId: oldYearId,
        campusId,
        gradeLevelId,
        capacity: 40,
      });
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
      .send({ employeeId: teacherEmployeeId, subjectId, classroomId, academicYearId: oldYearId });

    const todayDayOfWeek = (new Date().getUTCDay() + 6) % 7;
    const timetable = await request(app)
      .post("/api/v1/school-config/timetables")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ classroomId, academicYearId: oldYearId });
    await request(app)
      .post(`/api/v1/school-config/timetables/${(timetable.body as { id: string }).id}/entries`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        subjectId,
        teacherEmployeeId,
        dayOfWeek: todayDayOfWeek,
        startTime: "08:00",
        endTime: "09:00",
      });

    const dashboardDuringOldYear = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(dashboardDuringOldYear.status).toBe(200);
    const beforeBody = dashboardDuringOldYear.body as {
      classAssignments: { classroomId: string }[];
      todayClasses: { subjectId: string }[];
      classesNeedingRollCall: { classroomId: string }[];
    };
    expect(beforeBody.classAssignments.some((a) => a.classroomId === classroomId)).toBe(true);
    expect(beforeBody.todayClasses.some((c) => c.subjectId === subjectId)).toBe(true);
    expect(beforeBody.classesNeedingRollCall.some((c) => c.classroomId === classroomId)).toBe(true);

    const newYear = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `New-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const newYearId = (newYear.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/school-config/academic-years/${newYearId}/set-current`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const dashboardAfterRollover = await request(app)
      .get("/api/v1/dashboard/enseignant")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(dashboardAfterRollover.status).toBe(200);
    const afterBody = dashboardAfterRollover.body as {
      classAssignments: { classroomId: string }[];
      todayClasses: { subjectId: string }[];
      classesNeedingRollCall: { classroomId: string }[];
    };
    expect(afterBody.classAssignments.some((a) => a.classroomId === classroomId)).toBe(false);
    expect(afterBody.todayClasses.some((c) => c.subjectId === subjectId)).toBe(false);
    expect(afterBody.classesNeedingRollCall.some((c) => c.classroomId === classroomId)).toBe(false);
  }, 30000);
});
