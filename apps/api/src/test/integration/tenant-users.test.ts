import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("tenant users / membership management (§17)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  async function setUpTenantWithOwner(): Promise<{
    tenantId: string;
    subdomain: string;
    ownerToken: string;
    teacherToken: string;
    adminToken: string;
  }> {
    const { tenant, subdomain } = await createTenant("TenantUsers");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("tu-owner");
    createdUserIds.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("tu-teacher");
    createdUserIds.push(teacher.id);
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    // SCHOOL_ADMIN also holds tenant.settings.manage (the only permission this
    // route is gated by) but is missing several permissions SCHOOL_OWNER has
    // (finance.write, hr.manage, hr.salary.manage, subscriptions.manage, ...) —
    // exactly the gap a privilege-escalation attempt would exploit.
    const admin = await createUser("tu-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_ADMIN", tenant.id);

    return {
      tenantId: tenant.id,
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
      adminToken: signAccessToken({ sub: admin.id }),
    };
  }

  it("lets a SCHOOL_OWNER invite and list members, but refuses a TEACHER without tenant.settings.manage", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenantWithOwner();
    const email = `invitee-${uniqueSuffix()}@example.test`;

    const denied = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ email, roleCode: "TEACHER", firstName: "Nadia", lastName: "Sow" });
    expect(denied.status).toBe(403);

    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ email, roleCode: "TEACHER", firstName: "Nadia", lastName: "Sow" });
    expect(invited.status).toBe(201);
    const invitedBody = invited.body as { userId: string; roleCodes: string[]; membershipStatus: string };
    expect(invitedBody.roleCodes).toEqual(["TEACHER"]);
    expect(invitedBody.membershipStatus).toBe("ACTIVE");
    createdUserIds.push(invitedBody.userId);

    const listed = await request(app)
      .get("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(listed.status).toBe(200);
    const users = listed.body as { userId: string; email: string }[];
    expect(users.some((user) => user.userId === invitedBody.userId && user.email === email)).toBe(true);
  });

  it("rejects inviting a user who is already a member of the tenant", async () => {
    const { tenantId, subdomain, ownerToken } = await setUpTenantWithOwner();

    const newUser = await createUser("tu-dup");
    createdUserIds.push(newUser.id);
    await addMembership(newUser.id, tenantId);

    const alreadyMember = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ email: newUser.email, roleCode: "TEACHER" });
    expect(alreadyMember.status).toBe(409);
    expect((alreadyMember.body as { code: string }).code).toBe("ALREADY_MEMBER");
  });

  it("rejects an unknown role code when inviting", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        email: `nobody-${uniqueSuffix()}@example.test`,
        roleCode: "NOT_A_ROLE",
        firstName: "A",
        lastName: "B",
      });
    expect(invited.status).toBe(404);
    expect((invited.body as { code: string }).code).toBe("ROLE_NOT_FOUND");
  });

  it("grants and revokes an additional role for an existing member, guarding duplicates and unknown members", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const member = await createUser("tu-member");
    createdUserIds.push(member.id);

    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ email: member.email, roleCode: "TEACHER" });
    expect(invited.status).toBe(201);
    const userId = (invited.body as { userId: string }).userId;

    const granted = await request(app)
      .post(`/api/v1/tenant-users/${userId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "SCHOOL_ADMIN" });
    expect(granted.status).toBe(204);

    const grantedAgain = await request(app)
      .post(`/api/v1/tenant-users/${userId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "SCHOOL_ADMIN" });
    expect(grantedAgain.status).toBe(409);
    expect((grantedAgain.body as { code: string }).code).toBe("ROLE_ALREADY_GRANTED");

    const grantForUnknownMember = await request(app)
      .post("/api/v1/tenant-users/00000000-0000-0000-0000-000000000000/roles")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "TEACHER" });
    expect(grantForUnknownMember.status).toBe(404);
    expect((grantForUnknownMember.body as { code: string }).code).toBe("MEMBER_NOT_FOUND");

    const revoked = await request(app)
      .delete(`/api/v1/tenant-users/${userId}/roles/SCHOOL_ADMIN`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revoked.status).toBe(204);

    const revokedAgain = await request(app)
      .delete(`/api/v1/tenant-users/${userId}/roles/SCHOOL_ADMIN`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revokedAgain.status).toBe(404);
    expect((revokedAgain.body as { code: string }).code).toBe("ROLE_NOT_GRANTED");
  });

  it("refuses to let a SCHOOL_ADMIN grant or invite someone straight to SCHOOL_OWNER (privilege escalation)", async () => {
    // §17 : tenant.settings.manage gates managing membership, not which privileges a
    // granter can hand out — a SCHOOL_ADMIN holds that permission but not every
    // permission SCHOOL_OWNER has, so it must not be able to promote a member (or
    // itself) or invite a newcomer straight into SCHOOL_OWNER.
    const { subdomain, ownerToken, adminToken } = await setUpTenantWithOwner();

    const member = await createUser("tu-escalation-target");
    createdUserIds.push(member.id);
    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ email: member.email, roleCode: "TEACHER" });
    expect(invited.status).toBe(201);
    const memberId = (invited.body as { userId: string }).userId;

    const escalateOther = await request(app)
      .post(`/api/v1/tenant-users/${memberId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "SCHOOL_OWNER" });
    expect(escalateOther.status).toBe(403);
    expect((escalateOther.body as { code: string }).code).toBe("ROLE_EXCEEDS_GRANTER_PERMISSIONS");

    // Same gap via a narrower role: HR_MANAGER only carries hr.manage/
    // hr.salary.manage, neither of which SCHOOL_ADMIN holds either.
    const escalateViaHrRole = await request(app)
      .post(`/api/v1/tenant-users/${memberId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "HR_MANAGER" });
    expect(escalateViaHrRole.status).toBe(403);
    expect((escalateViaHrRole.body as { code: string }).code).toBe("ROLE_EXCEEDS_GRANTER_PERMISSIONS");

    const inviteAsOwner = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        email: `escalation-invite-${uniqueSuffix()}@example.test`,
        roleCode: "SCHOOL_OWNER",
        firstName: "Malick",
        lastName: "Fall",
      });
    expect(inviteAsOwner.status).toBe(403);
    expect((inviteAsOwner.body as { code: string }).code).toBe("ROLE_EXCEEDS_GRANTER_PERMISSIONS");

    // Sanity check the guard isn't overly broad: a SCHOOL_OWNER (superset of every
    // permission any tenant role carries) can still grant SCHOOL_OWNER.
    const ownerGrantsOwner = await request(app)
      .post(`/api/v1/tenant-users/${memberId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "SCHOOL_OWNER" });
    expect(ownerGrantsOwner.status).toBe(204);
  });

  it("updates a member's status", async () => {
    const { subdomain, ownerToken } = await setUpTenantWithOwner();

    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        email: `suspend-${uniqueSuffix()}@example.test`,
        roleCode: "TEACHER",
        firstName: "Léo",
        lastName: "Kane",
      });
    const userId = (invited.body as { userId: string }).userId;
    createdUserIds.push(userId);

    const suspended = await request(app)
      .patch(`/api/v1/tenant-users/${userId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "SUSPENDED" });
    expect(suspended.status).toBe(204);

    const listed = await request(app)
      .get("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    const users = listed.body as { userId: string; membershipStatus: string }[];
    expect(users.find((user) => user.userId === userId)?.membershipStatus).toBe("SUSPENDED");

    const statusForUnknownMember = await request(app)
      .patch("/api/v1/tenant-users/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "SUSPENDED" });
    expect(statusForUnknownMember.status).toBe(404);
    expect((statusForUnknownMember.body as { code: string }).code).toBe("MEMBER_NOT_FOUND");
  });
});
