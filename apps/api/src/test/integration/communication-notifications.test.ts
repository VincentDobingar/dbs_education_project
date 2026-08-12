import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  createVerifiedRelationship,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("notifications aux parents — §28 tranche 1", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.notification.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.disciplinaryIncident.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.attendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.classroom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.gradeLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.educationCycle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("notifie le parent vérifié d'une absence puis d'un incident, et guarde la propriété des notifications", async () => {
    const { tenant, subdomain } = await createTenant("NotifTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("notif-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacher = await createUser("notif-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const parent = await createUser("notif-parent");
    const parentToken = signAccessToken({ sub: parent.id });

    const student = await createStudent(tenant.id);
    await createVerifiedRelationship(parent.id, student.id, tenant.id);

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const academicYearId = (year.body as { id: string }).id;

    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });

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
    const classroomId = (classroom.body as { id: string }).id;

    const noNotificationsYet = await request(app)
      .get("/api/v1/communication/notifications")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(noNotificationsYet.status).toBe(200);
    expect((noNotificationsYet.body as unknown[]).length).toBe(0);

    const rollCall = await request(app)
      .put("/api/v1/attendance/roll-call")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        classroomId,
        date: "2025-10-01",
        entries: [{ studentId: student.id, status: "ABSENT" }],
      });
    expect(rollCall.status).toBe(200);

    const afterAbsence = await request(app)
      .get("/api/v1/communication/notifications")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(afterAbsence.status).toBe(200);
    const absenceNotifications = afterAbsence.body as { id: string; type: string; status: string }[];
    expect(absenceNotifications.length).toBe(1);
    expect(absenceNotifications[0]?.type).toBe("attendance.absence");
    expect(absenceNotifications[0]?.status).toBe("SENT");
    const absenceNotificationId = absenceNotifications[0]?.id as string;

    const deniedRead = await request(app)
      .patch(`/api/v1/communication/notifications/${absenceNotificationId}/read`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(deniedRead.status).toBe(404);

    const markedRead = await request(app)
      .patch(`/api/v1/communication/notifications/${absenceNotificationId}/read`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(markedRead.status).toBe(200);
    expect((markedRead.body as { status: string }).status).toBe("READ");

    const unreadOnly = await request(app)
      .get("/api/v1/communication/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((unreadOnly.body as unknown[]).length).toBe(0);

    const incident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: "2025-10-02",
        description: "Bagarre dans la cour",
        severity: "SEVERE",
      });
    expect(incident.status).toBe(201);

    const afterIncident = await request(app)
      .get("/api/v1/communication/notifications")
      .set("Authorization", `Bearer ${parentToken}`);
    const allNotifications = afterIncident.body as { type: string }[];
    expect(allNotifications.length).toBe(2);
    expect(allNotifications.some((n) => n.type === "discipline.incident")).toBe(true);
  });

  it("ne notifie personne quand l'élève n'a aucun parent vérifié", async () => {
    const { tenant, subdomain } = await createTenant("NotifTenant2");
    createdTenantIds.push(tenant.id);

    const teacher = await createUser("notif2-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const student = await createStudent(tenant.id);

    const incident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: "2025-10-02",
        description: "Retard répété",
        severity: "MINOR",
      });
    expect(incident.status).toBe(201);

    const notifications = await testAdminPrisma.notification.findMany({ where: { tenantId: tenant.id } });
    expect(notifications.length).toBe(0);
  });
});
