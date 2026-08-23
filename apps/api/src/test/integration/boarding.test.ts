import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createStudent, createTenant, createUser, grantRole } from "../fixtures.js";

describe("internat (§29)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.dormitoryAttendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentBedAssignment.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.dormitoryBed.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.dormitoryRoom.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    tenantId: string;
    ownerToken: string;
    managerToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("BoardingTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("brd-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    // BOARDING_MANAGER est un nouveau role introduit par cette tranche — verifie
    // qu'il fonctionne reellement, pas seulement au seed.
    const manager = await createUser("brd-manager");
    await addMembership(manager.id, tenant.id);
    await grantRole(manager.id, "BOARDING_MANAGER", tenant.id);
    const managerToken = signAccessToken({ sub: manager.id });

    const teacher = await createUser("brd-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    return { subdomain, tenantId: tenant.id, ownerToken, managerToken, teacherToken };
  }

  it("lets a BOARDING_MANAGER manage rooms and beds, refuses a TEACHER, and blocks removing an occupied bed", async () => {
    const { subdomain, tenantId, managerToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/boarding/rooms")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Dortoir A", capacity: 4 });
    expect(denied.status).toBe(403);

    const room = await request(app)
      .post("/api/v1/boarding/rooms")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Dortoir A", capacity: 4 });
    expect(room.status).toBe(201);
    const roomId = (room.body as { id: string }).id;

    const duplicateRoom = await request(app)
      .post("/api/v1/boarding/rooms")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Dortoir A", capacity: 6 });
    expect(duplicateRoom.status).toBe(409);
    expect((duplicateRoom.body as { code: string }).code).toBe("ROOM_NAME_TAKEN");

    const bed1 = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ label: "Lit 1" });
    expect(bed1.status).toBe(201);
    const bed1Id = (bed1.body as { id: string }).id;

    const student = await createStudent(tenantId, "BRD");

    const assigned = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds/${bed1Id}/assign`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, startDate: "2026-09-01" });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { bedId: string }).bedId).toBe(bed1Id);

    const removeOccupied = await request(app)
      .delete(`/api/v1/boarding/rooms/${roomId}/beds/${bed1Id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removeOccupied.status).toBe(409);
    expect((removeOccupied.body as { code: string }).code).toBe("BED_OCCUPIED");

    const archived = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/archive`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(archived.status).toBe(200);

    const listedAfterArchive = await request(app)
      .get("/api/v1/boarding/rooms")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listedAfterArchive.body as { id: string }[]).some((r) => r.id === roomId)).toBe(false);
  });

  it("reassigns a student between beds (freeing the old one), blocks assigning an already-occupied bed, and tracks nightly presence", async () => {
    const { subdomain, tenantId, ownerToken, managerToken } = await setUpTenant();

    const room = await request(app)
      .post("/api/v1/boarding/rooms")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Dortoir B", capacity: 4 });
    const roomId = (room.body as { id: string }).id;

    const bedA = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ label: "Lit A" });
    const bedAId = (bedA.body as { id: string }).id;

    const bedB = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ label: "Lit B" });
    const bedBId = (bedB.body as { id: string }).id;

    const studentOne = await createStudent(tenantId, "BRD1");
    const studentTwo = await createStudent(tenantId, "BRD2");

    await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds/${bedAId}/assign`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: studentOne.id, startDate: "2026-09-01" });

    const bedOccupiedByOther = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds/${bedAId}/assign`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: studentTwo.id, startDate: "2026-09-01" });
    expect(bedOccupiedByOther.status).toBe(409);
    expect((bedOccupiedByOther.body as { code: string }).code).toBe("BED_OCCUPIED");

    // Reaffecte le premier eleve vers le lit B — libere automatiquement le lit A.
    const reassigned = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds/${bedBId}/assign`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: studentOne.id, startDate: "2026-09-05" });
    expect(reassigned.status).toBe(200);
    expect((reassigned.body as { bedId: string }).bedId).toBe(bedBId);

    // Le lit A est desormais libre pour le second eleve.
    const secondAssigned = await request(app)
      .post(`/api/v1/boarding/rooms/${roomId}/beds/${bedAId}/assign`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: studentTwo.id, startDate: "2026-09-05" });
    expect(secondAssigned.status).toBe(200);

    const beds = await request(app)
      .get(`/api/v1/boarding/rooms/${roomId}/beds`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(beds.status).toBe(200);
    const bedsBody = beds.body as { id: string; assignment: { studentId: string } | null }[];
    expect(bedsBody.find((b) => b.id === bedAId)?.assignment?.studentId).toBe(studentTwo.id);
    expect(bedsBody.find((b) => b.id === bedBId)?.assignment?.studentId).toBe(studentOne.id);

    const present = await request(app)
      .post(`/api/v1/boarding/students/${studentOne.id}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-09-10", status: "PRESENT" });
    expect(present.status).toBe(200);

    // Meme nuit, corrige en absent — un upsert, jamais une deuxieme ligne.
    const corrected = await request(app)
      .post(`/api/v1/boarding/students/${studentOne.id}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ date: "2026-09-10", status: "ABSENT" });
    expect(corrected.status).toBe(200);

    const listedAttendance = await request(app)
      .get(`/api/v1/boarding/students/${studentOne.id}/attendance?date=2026-09-10`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedAttendance.status).toBe(200);
    const attendances = listedAttendance.body as { status: string }[];
    expect(attendances.length).toBe(1);
    expect(attendances[0]?.status).toBe("ABSENT");

    const unassigned = await request(app)
      .delete(`/api/v1/boarding/students/${studentOne.id}/assignment`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(unassigned.status).toBe(204);

    const unassignAgain = await request(app)
      .delete(`/api/v1/boarding/students/${studentOne.id}/assignment`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(unassignAgain.status).toBe(404);
    expect((unassignAgain.body as { code: string }).code).toBe("ASSIGNMENT_NOT_FOUND");

    // Le lit B, maintenant libre, peut a nouveau etre retire.
    const removed = await request(app)
      .delete(`/api/v1/boarding/rooms/${roomId}/beds/${bedBId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removed.status).toBe(204);
  }, 20000);
});
