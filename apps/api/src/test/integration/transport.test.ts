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
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("transport scolaire (§29)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.transportAttendance.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentRouteAssignment.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.routeStop.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.transportRoute.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.vehicle.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    ownerToken: string;
    managerToken: string;
    teacherToken: string;
    driverEmployeeId: string;
  }> {
    const { tenant, subdomain } = await createTenant("TransportTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("tr-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    // TRANSPORT_MANAGER n'avait auparavant aucune permission au seed — vérifie
    // que ce rôle jusque-là inerte fonctionne réellement désormais.
    const manager = await createUser("tr-manager");
    await addMembership(manager.id, tenant.id);
    await grantRole(manager.id, "TRANSPORT_MANAGER", tenant.id);
    const managerToken = signAccessToken({ sub: manager.id });

    const teacher = await createUser("tr-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacher.id });

    const driver = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Paul",
        lastName: "Biya",
        jobTitle: "Chauffeur",
      });

    return {
      subdomain,
      ownerToken,
      managerToken,
      teacherToken,
      driverEmployeeId: (driver.body as { id: string }).id,
    };
  }

  it("lets a TRANSPORT_MANAGER manage vehicles, refuses a TEACHER, and supports the retirement lifecycle", async () => {
    const { subdomain, managerToken, teacherToken } = await setUpTenant();
    const plateNumber = `CE-${uniqueSuffix()}-A`;

    const denied = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber, capacity: 30 });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber, model: "Toyota Coaster", capacity: 30 });
    expect(created.status).toBe(201);
    const vehicleId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber, capacity: 20 });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("PLATE_NUMBER_TAKEN");

    const updated = await request(app)
      .patch(`/api/v1/transport/vehicles/${vehicleId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "MAINTENANCE" });
    expect(updated.status).toBe(200);
    expect((updated.body as { status: string }).status).toBe("MAINTENANCE");

    const retired = await request(app)
      .post(`/api/v1/transport/vehicles/${vehicleId}/retire`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(retired.status).toBe(200);
    expect((retired.body as { status: string }).status).toBe("RETIRED");

    const fetchAfterRetire = await request(app)
      .get(`/api/v1/transport/vehicles/${vehicleId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetchAfterRetire.status).toBe(404);
  });

  it("builds a route with stops, assigns/reassigns/unassigns students, and tracks daily ridership", async () => {
    const { subdomain, ownerToken, managerToken, driverEmployeeId } = await setUpTenant();
    const tenantId = (await testAdminPrisma.tenantDomain.findFirstOrThrow({ where: { subdomain } })).tenantId;

    const vehicle = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber: `CE-${uniqueSuffix()}-B`, capacity: 25 });
    const vehicleId = (vehicle.body as { id: string }).id;

    const route = await request(app)
      .post("/api/v1/transport/routes")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Circuit Bastos", vehicleId, driverEmployeeId });
    expect(route.status).toBe(201);
    const routeId = (route.body as { id: string }).id;

    const stopA = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/stops`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ label: "Arrêt Bastos", order: 1, time: "06:30" });
    const stopAId = (stopA.body as { id: string }).id;

    const stopB = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/stops`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ label: "Arrêt Mvan", order: 2, time: "06:45" });
    const stopBId = (stopB.body as { id: string }).id;

    const listedStops = await request(app)
      .get(`/api/v1/transport/routes/${routeId}/stops`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedStops.status).toBe(200);
    expect((listedStops.body as { id: string }[]).map((s) => s.id)).toEqual([stopAId, stopBId]);

    const student = await createStudent(tenantId, "TR");

    const assigned = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/students`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, stopId: stopAId });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { stopId: string }).stopId).toBe(stopAId);

    // Reaffectation : remplace l'affectation existante, jamais un doublon.
    const reassigned = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/students`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, stopId: stopBId });
    expect(reassigned.status).toBe(200);
    expect((reassigned.body as { stopId: string }).stopId).toBe(stopBId);

    const listedStudents = await request(app)
      .get(`/api/v1/transport/routes/${routeId}/students`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedStudents.status).toBe(200);
    expect((listedStudents.body as { studentId: string }[]).length).toBe(1);

    const boarded = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, date: "2026-02-02", status: "BOARDED" });
    expect(boarded.status).toBe(200);

    // Meme jour, corrige en absent — un upsert, jamais une deuxieme ligne.
    const corrected = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/attendance`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, date: "2026-02-02", status: "ABSENT" });
    expect(corrected.status).toBe(200);

    const listedAttendance = await request(app)
      .get(`/api/v1/transport/routes/${routeId}/attendance?date=2026-02-02`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listedAttendance.status).toBe(200);
    const attendances = listedAttendance.body as { status: string }[];
    expect(attendances.length).toBe(1);
    expect(attendances[0]?.status).toBe("ABSENT");

    const unassigned = await request(app)
      .delete(`/api/v1/transport/students/${student.id}/assignment`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(unassigned.status).toBe(204);

    const unassignAgain = await request(app)
      .delete(`/api/v1/transport/students/${student.id}/assignment`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(unassignAgain.status).toBe(404);
    expect((unassignAgain.body as { code: string }).code).toBe("ASSIGNMENT_NOT_FOUND");

    const removedStop = await request(app)
      .delete(`/api/v1/transport/routes/${routeId}/stops/${stopAId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(removedStop.status).toBe(204);

    const cancelled = await request(app)
      .delete(`/api/v1/transport/routes/${routeId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(cancelled.status).toBe(204);

    const fetchAfterCancel = await request(app)
      .get(`/api/v1/transport/routes/${routeId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetchAfterCancel.status).toBe(404);
  }, 20000);

  // requireVehicle/assignStudentToRoute ne vérifiaient que Vehicle.deletedAt,
  // jamais Vehicle.status -- un véhicule retiré via PATCH (sans passer par
  // retireVehicle) restait rattachable à un itinéraire, et un itinéraire dont
  // le véhicule avait été retiré via le endpoint dédié continuait d'accepter de
  // nouveaux élèves puisque assignStudentToRoute ne consultait jamais le
  // véhicule associé.
  it("stops attaching or assigning students to a retired vehicle's route", async () => {
    const { subdomain, ownerToken, managerToken } = await setUpTenant();
    const tenantId = (await testAdminPrisma.tenantDomain.findFirstOrThrow({ where: { subdomain } })).tenantId;

    const vehicle = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber: `CE-${uniqueSuffix()}-C`, capacity: 25 });
    const vehicleId = (vehicle.body as { id: string }).id;

    // Route créée pendant que le véhicule est encore actif.
    const route = await request(app)
      .post("/api/v1/transport/routes")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Circuit Retired", vehicleId });
    expect(route.status).toBe(201);
    const routeId = (route.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/transport/vehicles/${vehicleId}/retire`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();

    const student = await createStudent(tenantId, "TR");
    const assignAfterRetire = await request(app)
      .post(`/api/v1/transport/routes/${routeId}/students`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id });
    expect(assignAfterRetire.status).toBe(404);
    expect((assignAfterRetire.body as { code: string }).code).toBe("VEHICLE_NOT_FOUND");

    // PATCH status: RETIRED (sans passer par /retire) pose status seul, jamais
    // deletedAt -- requireVehicle doit quand même refuser de le rattacher.
    const secondVehicle = await request(app)
      .post("/api/v1/transport/vehicles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ plateNumber: `CE-${uniqueSuffix()}-D`, capacity: 25 });
    const secondVehicleId = (secondVehicle.body as { id: string }).id;

    await request(app)
      .patch(`/api/v1/transport/vehicles/${secondVehicleId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "RETIRED" });

    const newRouteWithRetiredVehicle = await request(app)
      .post("/api/v1/transport/routes")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: "Circuit Should Fail", vehicleId: secondVehicleId });
    expect(newRouteWithRetiredVehicle.status).toBe(404);
    expect((newRouteWithRetiredVehicle.body as { code: string }).code).toBe("VEHICLE_NOT_FOUND");
  });
});
