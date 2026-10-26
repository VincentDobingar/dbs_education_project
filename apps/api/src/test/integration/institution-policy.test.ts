import request from "supertest";
import { afterAll, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma as db } from "../admin-client.js";
import { createTenant, createUser, addMembership, grantRole } from "../fixtures.js";

const tenantIds: string[] = [];
const userIds: string[] = [];
afterAll(async () => {
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.tenantDomain.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
});
it("réserve les utilisateurs au superadmin et la saisie des travaux aux enseignants", async () => {
  const app = createApp();
  const { tenant, subdomain } = await createTenant("ReadOnlyInstitution");
  tenantIds.push(tenant.id);
  const owner = await createUser("institution-owner");
  const superadmin = await createUser("institution-superadmin");
  userIds.push(owner.id, superadmin.id);
  await addMembership(owner.id, tenant.id);
  await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
  await grantRole(superadmin.id, "SUPER_ADMIN", null);
  const ownHeaders = {
    Authorization: `Bearer ${signAccessToken({ sub: owner.id })}`,
    "X-Tenant-Slug": subdomain,
  };
  expect((await request(app).get("/api/v1/tenant-users").set(ownHeaders)).status).toBe(403);
  expect((await request(app).get("/api/v1/platform/users").set(ownHeaders)).status).toBe(403);
  const users = await request(app)
    .get("/api/v1/platform/users")
    .set("Authorization", `Bearer ${signAccessToken({ sub: superadmin.id })}`);
  expect(users.status).toBe(200);
  expect((users.body as Record<string, unknown>[]).every((u) => !Object.hasOwn(u, "passwordHash"))).toBe(
    true,
  );
  const denied = await request(app).post("/api/v1/homework").set(ownHeaders).send({});
  expect(denied.status).toBe(403);
  expect((await request(app).patch("/api/v1/grading/grades/not-a-grade/correct").set(ownHeaders).send({ score: 18, reason: "test" })).status).toBe(403);
  expect((denied.body as { code: string }).code).toBe("TEACHER_ENTRY_REQUIRED");
});
