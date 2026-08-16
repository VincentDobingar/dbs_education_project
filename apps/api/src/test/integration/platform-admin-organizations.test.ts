import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser, grantRole } from "../fixtures.js";

describe("super-administration — organisations sponsors (§31 tranche 7)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
  });

  it("CRUD complet avec suppression douce et moindre privilège", async () => {
    const superAdmin = await createUser("org-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("org-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const createDeniedForAuditor = await request(app)
      .post("/api/v1/platform/organizations")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ name: "Fondation Éducation", type: "NGO" });
    expect(createDeniedForAuditor.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/platform/organizations")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "Fondation Éducation", type: "NGO", contactEmail: "contact@fondation.test" });
    expect(created.status).toBe(201);
    const organizationId = (created.body as { id: string }).id;
    createdOrganizationIds.push(organizationId);

    const list = await request(app)
      .get("/api/v1/platform/organizations?type=NGO")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some((o) => o.id === organizationId)).toBe(true);

    const updated = await request(app)
      .patch(`/api/v1/platform/organizations/${organizationId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "Fondation Éducation Afrique" });
    expect(updated.status).toBe(200);
    expect((updated.body as { name: string }).name).toBe("Fondation Éducation Afrique");

    const deleted = await request(app)
      .delete(`/api/v1/platform/organizations/${organizationId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(deleted.status).toBe(204);

    const listAfterDelete = await request(app)
      .get("/api/v1/platform/organizations?type=NGO")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect((listAfterDelete.body as { id: string }[]).some((o) => o.id === organizationId)).toBe(false);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=Organization`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === organizationId)
      .map((log) => log.action);
    expect(actions).toContain("organization.create");
    expect(actions).toContain("organization.update");
    expect(actions).toContain("organization.delete");
  }, 20000);
});
