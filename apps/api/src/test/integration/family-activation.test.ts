import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createTenant, createUser, addMembership, grantRole } from "../fixtures.js";

describe("rattachement parent-élève par invitation (§8)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.activationCode.deleteMany({
      where: { invitation: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationInvitation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.studentUserLink.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{
    subdomain: string;
    adminToken: string;
    teacherToken: string;
    studentId: string;
  }> {
    const { tenant, subdomain } = await createTenant("FamilyTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("fam-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("fam-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    const student = await createStudent(tenant.id);

    return {
      subdomain,
      adminToken: signAccessToken({ sub: admin.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
      studentId: student.id,
    };
  }

  it("crée une invitation PARENT, la rédemption la vérifie, et guarde les cas d'erreur", async () => {
    const { subdomain, adminToken, teacherToken, studentId } = await setUpTenant();

    const parent = await createUser("fam-parent");
    const parentToken = signAccessToken({ sub: parent.id });

    const denied = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    expect(denied.status).toBe(403);

    const missingContact = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT" });
    expect(missingContact.status).toBe(400);

    const missingStudent = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: "does-not-exist", beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    expect(missingStudent.status).toBe(404);

    const created = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    expect(created.status).toBe(201);
    const { code, invitation } = created.body as { code: string; invitation: { status: string } };
    expect(code).toHaveLength(10);
    expect(invitation.status).toBe("SENT");

    const wrongCode = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: "WRONGCODE1" });
    expect(wrongCode.status).toBe(400);
    expect((wrongCode.body as { code: string }).code).toBe("ACTIVATION_CODE_INVALID");

    const mismatchedBeneficiary = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ code });
    expect(mismatchedBeneficiary.status).toBe(403);
    expect((mismatchedBeneficiary.body as { code: string }).code).toBe("BENEFICIARY_MISMATCH");

    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code });
    expect(redeemed.status).toBe(200);
    expect((redeemed.body as { beneficiaryCategory: string }).beneficiaryCategory).toBe("PARENT");
    expect((redeemed.body as { relationship: { status: string } }).relationship.status).toBe("VERIFIED");

    const reused = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code });
    expect(reused.status).toBe(409);
    expect((reused.body as { code: string }).code).toBe("ACTIVATION_CODE_ALREADY_USED");

    const children = await request(app)
      .get("/api/v1/family/children")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(children.status).toBe(200);
    expect((children.body as { student: { id: string } }[]).some((c) => c.student.id === studentId)).toBe(
      true,
    );

    const relationshipId = (redeemed.body as { relationship: { id: string } }).relationship.id;
    const revoked = await request(app)
      .post(`/api/v1/family/relationships/${relationshipId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ reason: "Erreur de saisie" });
    expect(revoked.status).toBe(200);
    expect((revoked.body as { status: string }).status).toBe("REVOKED");

    const childrenAfterRevoke = await request(app)
      .get("/api/v1/family/children")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((childrenAfterRevoke.body as unknown[]).length).toBe(0);

    const revokeAgain = await request(app)
      .post(`/api/v1/family/relationships/${relationshipId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ reason: "Encore" });
    expect(revokeAgain.status).toBe(409);
    expect((revokeAgain.body as { code: string }).code).toBe("RELATIONSHIP_ALREADY_REVOKED");
  });

  it("révoque une invitation non utilisée et bloque la rédemption ultérieure", async () => {
    const { subdomain, adminToken, studentId } = await setUpTenant();
    const parent = await createUser("fam-parent2");
    const parentToken = signAccessToken({ sub: parent.id });

    const created = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    const { code, invitation } = created.body as { code: string; invitation: { id: string } };

    const listed = await request(app)
      .get(`/api/v1/family/invitations?studentId=${studentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    expect((listed.body as { id: string }[]).some((i) => i.id === invitation.id)).toBe(true);

    const revoked = await request(app)
      .post(`/api/v1/family/invitations/${invitation.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revoked.status).toBe(200);
    expect((revoked.body as { status: string }).status).toBe("REVOKED");

    const blockedRedeem = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code });
    expect(blockedRedeem.status).toBe(400);
    expect((blockedRedeem.body as { code: string }).code).toBe("ACTIVATION_CODE_INVALID");

    const revokeAgain = await request(app)
      .post(`/api/v1/family/invitations/${invitation.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revokeAgain.status).toBe(409);
    expect((revokeAgain.body as { code: string }).code).toBe("INVITATION_ALREADY_REVOKED");
  });

  it("gère une invitation STUDENT et refuse un second rattachement du même élève", async () => {
    const { subdomain, adminToken, studentId } = await setUpTenant();
    const studentUser = await createUser("fam-student");
    const studentToken = signAccessToken({ sub: studentUser.id });
    const otherUser = await createUser("fam-other");
    const otherToken = signAccessToken({ sub: otherUser.id });

    const created = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "STUDENT", invitedEmail: studentUser.email });
    const { code } = created.body as { code: string };

    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ code });
    expect(redeemed.status).toBe(200);
    expect((redeemed.body as { beneficiaryCategory: string }).beneficiaryCategory).toBe("STUDENT");
    expect((redeemed.body as { studentLink: { userId: string } }).studentLink.userId).toBe(studentUser.id);

    const secondInvitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "STUDENT", invitedEmail: otherUser.email });
    const { code: secondCode } = secondInvitation.body as { code: string };

    const conflict = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ code: secondCode });
    expect(conflict.status).toBe(409);
    expect((conflict.body as { code: string }).code).toBe("STUDENT_ALREADY_LINKED");
  });
});
