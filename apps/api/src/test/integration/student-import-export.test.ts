import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("import/export CSV des élèves (§19)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
    const { tenant, subdomain } = await createTenant("ImportExportTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("ie-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("ie-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("imports valid rows, reports per-row errors, and refuses a TEACHER without students.write", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenantWithOwner();
    const suffix = uniqueSuffix();
    const csv = [
      "matricule,firstName,lastName,dateOfBirth,gender",
      `IMP-${suffix}-1,Yaya,Toure,2010-05-01,M`,
      `IMP-${suffix}-2,Aissatou,Diop,,F`,
      `IMP-${suffix}-2,Dup,Licate,,F`,
      `IMP-${suffix}-3,,Missing,,`,
    ].join("\n");

    const denied = await request(app)
      .post("/api/v1/students/import")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ csv });
    expect(denied.status).toBe(403);

    const imported = await request(app)
      .post("/api/v1/students/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ csv });
    expect(imported.status).toBe(200);
    const body = imported.body as {
      created: { row: number; matricule: string }[];
      errors: { row: number; message: string }[];
    };
    expect(body.created.length).toBe(2);
    expect(body.created.map((c) => c.matricule)).toEqual([`IMP-${suffix}-1`, `IMP-${suffix}-2`]);
    expect(body.errors.length).toBe(2);
    expect(body.errors.map((e) => e.row)).toEqual([4, 5]);

    const listed = await request(app)
      .get("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((listed.body as unknown[]).length).toBe(2);
  });

  it("reports a matricule that already exists in the tenant as a row error", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const matricule = `MAT-${uniqueSuffix()}`;

    const existing = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule, firstName: "Existing", lastName: "Student" });
    expect(existing.status).toBe(201);

    const csv = ["matricule,firstName,lastName", `${matricule},New,Comer`].join("\n");
    const imported = await request(app)
      .post("/api/v1/students/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ csv });
    expect(imported.status).toBe(200);
    const body = imported.body as { created: unknown[]; errors: { row: number; message: string }[] };
    expect(body.created.length).toBe(0);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0]?.message).toContain(matricule);
  });

  it("exports the roster as CSV, excluding medicalNotes and other non-roster fields", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();
    const matricule = `MAT-${uniqueSuffix()}`;

    const created = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        matricule,
        firstName: "Export",
        lastName: "Target",
        dateOfBirth: "2009-07-15",
        gender: "F",
        emergencyContactPhone: "+237600000000",
        medicalNotes: "Traitement confidentiel XYZ",
      });
    expect(created.status).toBe(201);

    const exported = await request(app)
      .get("/api/v1/students/export")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.headers["content-disposition"]).toContain("students.csv");

    const csvText = exported.text;
    expect(csvText.split("\r\n")[0]).toBe("matricule,firstName,lastName,dateOfBirth,gender,status");
    expect(csvText).toContain(matricule);
    expect(csvText).toContain("Export");
    expect(csvText).toContain("2009-07-15");
    expect(csvText).not.toContain("Traitement confidentiel XYZ");
    expect(csvText).not.toContain("+237600000000");
  });
});
