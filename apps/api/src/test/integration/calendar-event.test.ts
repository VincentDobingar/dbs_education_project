import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

// §20 : "calendrier/jours fériés dédié" — AcademicPeriod ne couvre que le découpage
// trimestre/semestre, jamais un jour férié ou un événement ponctuel.
describe("calendrier / jours fériés (§20)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.calendarEvent.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{ subdomain: string; ownerToken: string; teacherToken: string }> {
    const { tenant, subdomain } = await createTenant("CalendarTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("cal-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("cal-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("creates, lists, updates and removes an event; refuses a write from a TEACHER and an invalid date range", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "HOLIDAY", title: "Fête du Travail", startDate: "2026-05-01" });
    expect(denied.status).toBe(403);

    const invalidRange = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "HOLIDAY", title: "Invalide", startDate: "2026-05-05", endDate: "2026-05-01" });
    expect(invalidRange.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "HOLIDAY", title: "Fête du Travail", startDate: "2026-05-01" });
    expect(created.status).toBe(201);
    const eventId = (created.body as { id: string }).id;

    const listed = await request(app)
      .get("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((event) => event.id === eventId)).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/school-config/calendar-events/${eventId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ title: "Fête du Travail (mise à jour)" });
    expect(updated.status).toBe(200);
    expect((updated.body as { title: string }).title).toBe("Fête du Travail (mise à jour)");

    const removed = await request(app)
      .delete(`/api/v1/school-config/calendar-events/${eventId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(removed.status).toBe(204);

    const listedAfterRemove = await request(app)
      .get("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedAfterRemove.body as { id: string }[]).some((event) => event.id === eventId)).toBe(false);
  });

  it("filters by date range, matching events that overlap the window rather than only ones starting inside it", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    // Spans three days, starting before the query window and overlapping into it.
    const spanning = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        type: "SCHOOL_EVENT",
        title: "Semaine culturelle",
        startDate: "2026-03-08",
        endDate: "2026-03-10",
      });
    expect(spanning.status).toBe(201);

    // Entirely outside the query window.
    const outside = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "HOLIDAY", title: "Hors fenêtre", startDate: "2026-01-01" });
    expect(outside.status).toBe(201);

    const filtered = await request(app)
      .get("/api/v1/school-config/calendar-events?startDate=2026-03-09&endDate=2026-03-31")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(filtered.status).toBe(200);
    const titles = (filtered.body as { title: string }[]).map((event) => event.title);
    expect(titles).toContain("Semaine culturelle");
    expect(titles).not.toContain("Hors fenêtre");
  });

  it("scopes an event to an academic year and refuses an unknown academicYearId", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    const unknownYear = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        type: "OTHER",
        title: "Événement",
        startDate: "2026-04-01",
        academicYearId: "00000000-0000-0000-0000-000000000000",
      });
    expect(unknownYear.status).toBe(404);
    expect((unknownYear.body as { code: string }).code).toBe("ACADEMIC_YEAR_NOT_FOUND");

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const academicYearId = (year.body as { id: string }).id;

    const scoped = await request(app)
      .post("/api/v1/school-config/calendar-events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ type: "EXAM_PERIOD", title: "Examens", startDate: "2026-04-01", academicYearId });
    expect(scoped.status).toBe(201);

    const filteredByYear = await request(app)
      .get(`/api/v1/school-config/calendar-events?academicYearId=${academicYearId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((filteredByYear.body as { id: string }[]).length).toBe(1);
  });
});
