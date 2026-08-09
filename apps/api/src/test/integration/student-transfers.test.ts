import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("transferts inter-établissements (§10, §19)", () => {
  const app = createApp();
  const tenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentTransfer.deleteMany({
      where: { OR: [{ fromTenantId: { in: tenantIds } }, { toTenantId: { in: tenantIds } }] },
    });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  async function setUpTenantWithOwnerAndTeacher(
    prefix: string,
  ): Promise<{ subdomain: string; ownerToken: string; teacherToken: string }> {
    const { tenant, subdomain } = await createTenant(prefix);
    tenantIds.push(tenant.id);

    const owner = await createUser(`${prefix}-owner`);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser(`${prefix}-teacher`);
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  async function createStudentIn(subdomain: string, ownerToken: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        matricule: `MAT-${uniqueSuffix()}`,
        firstName: "Kofi",
        lastName: "Asante",
        dateOfBirth: "2011-04-12",
        medicalNotes: "Asthme léger",
      });
    return (created.body as { id: string }).id;
  }

  it("runs the full request -> approve -> complete flow across two tenants", async () => {
    const source = await setUpTenantWithOwnerAndTeacher("SrcA");
    const destination = await setUpTenantWithOwnerAndTeacher("DstA");
    const studentId = await createStudentIn(source.subdomain, source.ownerToken);

    const denied = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.teacherToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({
        studentId,
        toTenantSubdomain: destination.subdomain,
        dataScope: ["dateOfBirth", "medicalNotes"],
      });
    expect(denied.status).toBe(403);

    const requested = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({
        studentId,
        toTenantSubdomain: destination.subdomain,
        dataScope: ["dateOfBirth", "medicalNotes"],
      });
    expect(requested.status).toBe(201);
    const transferId = (requested.body as { id: string; status: string }).id;
    expect((requested.body as { status: string }).status).toBe("REQUESTED");

    const incoming = await request(app)
      .get("/api/v1/student-transfers?direction=incoming")
      .set("Authorization", `Bearer ${destination.ownerToken}`)
      .set("X-Tenant-Slug", destination.subdomain);
    expect(incoming.status).toBe(200);
    expect((incoming.body as { id: string }[]).some((t) => t.id === transferId)).toBe(true);

    const sourceCannotApprove = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/approve`)
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send();
    expect(sourceCannotApprove.status).toBe(404);

    const completeBeforeApproval = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/complete`)
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ matricule: `NEW-${uniqueSuffix()}` });
    expect(completeBeforeApproval.status).toBe(409);

    const approved = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/approve`)
      .set("Authorization", `Bearer ${destination.ownerToken}`)
      .set("X-Tenant-Slug", destination.subdomain)
      .send();
    expect(approved.status).toBe(200);
    expect((approved.body as { status: string }).status).toBe("APPROVED");

    const destinationCannotComplete = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/complete`)
      .set("Authorization", `Bearer ${destination.ownerToken}`)
      .set("X-Tenant-Slug", destination.subdomain)
      .send({ matricule: `NEW-${uniqueSuffix()}` });
    expect(destinationCannotComplete.status).toBe(404);

    const newMatricule = `NEW-${uniqueSuffix()}`;
    const completed = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/complete`)
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ matricule: newMatricule });
    expect(completed.status).toBe(200);
    const completedBody = completed.body as {
      transfer: { status: string };
      newStudent: Record<string, unknown>;
    };
    expect(completedBody.transfer.status).toBe("COMPLETED");
    expect(completedBody.newStudent.matricule).toBe(newMatricule);
    expect(completedBody.newStudent.firstName).toBe("Kofi");
    expect(completedBody.newStudent.dateOfBirth).toBeTruthy();
    expect(completedBody.newStudent).not.toHaveProperty("medicalNotes");
    expect(completedBody.newStudent.gender).toBeFalsy();

    const newStudentId = completedBody.newStudent.id as string;
    const [rawNewStudent, rawSourceStudent] = await Promise.all([
      testAdminPrisma.student.findUniqueOrThrow({ where: { id: newStudentId } }),
      testAdminPrisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    ]);
    expect(rawNewStudent.medicalNotes).toBe("Asthme léger");
    expect(rawNewStudent.tenantId).not.toBe(rawSourceStudent.tenantId);

    const sourceAfter = await request(app)
      .get(`/api/v1/students/${studentId}`)
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain);
    expect((sourceAfter.body as { status: string }).status).toBe("TRANSFERRED");
  });

  it("rejects a transfer request to the same tenant, an unknown destination, and a duplicate pending request", async () => {
    const source = await setUpTenantWithOwnerAndTeacher("SrcB");
    const destination = await setUpTenantWithOwnerAndTeacher("DstB");
    const studentId = await createStudentIn(source.subdomain, source.ownerToken);

    const sameTenant = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ studentId, toTenantSubdomain: source.subdomain });
    expect(sameTenant.status).toBe(400);
    expect((sameTenant.body as { code: string }).code).toBe("SAME_TENANT_TRANSFER");

    const unknownDestination = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ studentId, toTenantSubdomain: `unknown-${uniqueSuffix()}` });
    expect(unknownDestination.status).toBe(404);
    expect((unknownDestination.body as { code: string }).code).toBe("DESTINATION_TENANT_NOT_FOUND");

    const first = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ studentId, toTenantSubdomain: destination.subdomain });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ studentId, toTenantSubdomain: destination.subdomain });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("TRANSFER_ALREADY_PENDING");
  });

  it("lets the destination reject a transfer, and blocks further action on it", async () => {
    const source = await setUpTenantWithOwnerAndTeacher("SrcC");
    const destination = await setUpTenantWithOwnerAndTeacher("DstC");
    const studentId = await createStudentIn(source.subdomain, source.ownerToken);

    const requested = await request(app)
      .post("/api/v1/student-transfers")
      .set("Authorization", `Bearer ${source.ownerToken}`)
      .set("X-Tenant-Slug", source.subdomain)
      .send({ studentId, toTenantSubdomain: destination.subdomain });
    const transferId = (requested.body as { id: string }).id;

    const rejected = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/reject`)
      .set("Authorization", `Bearer ${destination.ownerToken}`)
      .set("X-Tenant-Slug", destination.subdomain)
      .send();
    expect(rejected.status).toBe(200);
    expect((rejected.body as { status: string }).status).toBe("REJECTED");

    const approveAfterReject = await request(app)
      .post(`/api/v1/student-transfers/${transferId}/approve`)
      .set("Authorization", `Bearer ${destination.ownerToken}`)
      .set("X-Tenant-Slug", destination.subdomain)
      .send();
    expect(approveAfterReject.status).toBe(409);
    expect((approveAfterReject.body as { code: string }).code).toBe("INVALID_TRANSFER_STATUS");
  });
});
