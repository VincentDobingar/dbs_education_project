import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

// §20 : "salles comme entité propre" — jusqu'ici juste roomLabel en texte libre sur
// TimetableEntry (voir timetable.test.ts pour la garde de conflit cross-timetable).
describe("salles (§20)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.room.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.campus.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{ subdomain: string; ownerToken: string; teacherToken: string }> {
    const { tenant, subdomain } = await createTenant("RoomTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("room-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("room-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("creates, lists, updates and archives a room; refuses a duplicate name and a write from a TEACHER", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Salle 101" });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Salle 101", capacity: 30 });
    expect(created.status).toBe(201);
    const roomId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Salle 101" });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("ROOM_NAME_TAKEN");

    // Readable by any tenant member (only writes are gated), same as Campus/AcademicPeriod.
    const listed = await request(app)
      .get("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((room) => room.id === roomId)).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/school-config/rooms/${roomId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ capacity: 45 });
    expect(updated.status).toBe(200);
    expect((updated.body as { capacity: number }).capacity).toBe(45);

    const archived = await request(app)
      .post(`/api/v1/school-config/rooms/${roomId}/archive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(archived.status).toBe(200);

    const listedAfterArchive = await request(app)
      .get("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedAfterArchive.body as { id: string }[]).some((room) => room.id === roomId)).toBe(false);
  });

  it("scopes a room to a campus and refuses an unknown campusId", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    const unknownCampus = await request(app)
      .post("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Salle ${uniqueSuffix()}`, campusId: "00000000-0000-0000-0000-000000000000" });
    expect(unknownCampus.status).toBe(404);
    expect((unknownCampus.body as { code: string }).code).toBe("CAMPUS_NOT_FOUND");

    const campus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus principal", code: `CP-${uniqueSuffix()}` });
    const campusId = (campus.body as { id: string }).id;

    const otherCampus = await request(app)
      .post("/api/v1/school-config/campuses")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Campus annexe", code: `CP-${uniqueSuffix()}` });
    const otherCampusId = (otherCampus.body as { id: string }).id;

    const room = await request(app)
      .post("/api/v1/school-config/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Salle ${uniqueSuffix()}`, campusId });
    expect(room.status).toBe(201);
    const roomId = (room.body as { id: string }).id;

    const filteredByOwnCampus = await request(app)
      .get(`/api/v1/school-config/rooms?campusId=${campusId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((filteredByOwnCampus.body as { id: string }[]).some((r) => r.id === roomId)).toBe(true);

    const filteredByOtherCampus = await request(app)
      .get(`/api/v1/school-config/rooms?campusId=${otherCampusId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((filteredByOtherCampus.body as { id: string }[]).some((r) => r.id === roomId)).toBe(false);
  });
});
