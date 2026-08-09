import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("staff / personnel (§27)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenantWithOwner(): Promise<{
    subdomain: string;
    ownerToken: string;
    teacherToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("StaffTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("hr-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("hr-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("lets a SCHOOL_OWNER manage staff, but refuses a TEACHER without hr.manage", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenantWithOwner();

    const denied = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Awa",
        lastName: "Ngo",
        jobTitle: "Secrétaire",
      });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Awa",
        lastName: "Ngo",
        jobTitle: "Secrétaire",
      });
    expect(created.status).toBe(201);
    const body = created.body as { id: string; status: string };
    expect(body.status).toBe("ACTIVE");

    const listed = await request(app)
      .get("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    const employees = listed.body as Record<string, unknown>[];
    expect(employees.length).toBe(1);
    expect(employees[0]).not.toHaveProperty("salaryCents");
  });

  it("rejects a duplicate employee number within the same tenant", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const employeeNumber = `EMP-${uniqueSuffix()}`;

    const first = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeNumber, firstName: "Jean", lastName: "Mbala", jobTitle: "Comptable" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ employeeNumber, firstName: "Paul", lastName: "Eto", jobTitle: "Surveillant" });
    expect(second.status).toBe(409);
    expect((second.body as { code: string }).code).toBe("EMPLOYEE_NUMBER_TAKEN");
  });

  it("updates status and archives an employee (soft delete)", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const created = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Enseignante",
      });
    const employeeId = (created.body as { id: string }).id;

    const onLeave = await request(app)
      .patch(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "ON_LEAVE" });
    expect(onLeave.status).toBe(200);
    expect((onLeave.body as { status: string }).status).toBe("ON_LEAVE");

    const archived = await request(app)
      .post(`/api/v1/employees/${employeeId}/archive`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(archived.status).toBe(200);

    const fetchAfterArchive = await request(app)
      .get(`/api/v1/employees/${employeeId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(fetchAfterArchive.status).toBe(404);
  });
});
