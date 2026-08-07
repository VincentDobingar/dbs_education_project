import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signAccessToken } from "../../lib/jwt.js";
import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";
import { buildTestApp, type TestResponseBody } from "../test-app.js";

describe("authorization chain: requireAuth -> enforceTenantScope -> requireTenantMembership -> requirePermission", () => {
  const app = buildTestApp(
    requireAuth,
    enforceTenantScope,
    requireTenantMembership,
    requirePermission("students.read"),
  );

  let tenantId: string;
  let subdomain: string;
  let memberWithPermissionToken: string;
  let memberWithoutPermissionToken: string;
  let nonMemberToken: string;

  beforeAll(async () => {
    const created = await createTenant("RBAC");
    tenantId = created.tenant.id;
    subdomain = created.subdomain;

    const teacher = await createUser("teacher");
    await addMembership(teacher.id, tenantId);
    await grantRole(teacher.id, "TEACHER", tenantId);
    memberWithPermissionToken = signAccessToken({ sub: teacher.id });

    const plainMember = await createUser("plain-member");
    await addMembership(plainMember.id, tenantId);
    memberWithoutPermissionToken = signAccessToken({ sub: plainMember.id });

    const outsider = await createUser("outsider");
    nonMemberToken = signAccessToken({ sub: outsider.id });
  });

  afterAll(async () => {
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it("blocks an unauthenticated request", async () => {
    const response = await request(app).get("/protected").set("X-Tenant-Slug", subdomain);

    expect(response.status).toBe(401);
    expect((response.body as TestResponseBody).code).toBe("UNAUTHENTICATED");
  });

  it("blocks a user who is not a member of the tenant", async () => {
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${nonMemberToken}`)
      .set("X-Tenant-Slug", subdomain);

    expect(response.status).toBe(403);
    expect((response.body as TestResponseBody).code).toBe("TENANT_MEMBERSHIP_REQUIRED");
  });

  it("blocks a member who lacks the required permission", async () => {
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${memberWithoutPermissionToken}`)
      .set("X-Tenant-Slug", subdomain);

    expect(response.status).toBe(403);
    expect((response.body as TestResponseBody).code).toBe("PERMISSION_DENIED");
  });

  it("allows a member with the required permission", async () => {
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${memberWithPermissionToken}`)
      .set("X-Tenant-Slug", subdomain);

    expect(response.status).toBe(200);
  });
});
