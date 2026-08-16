import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("super-administration — parametres globaux (§31 tranche 10)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const settingKey = `default_trial_days-${uniqueSuffix()}`;

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.platformSetting.deleteMany({ where: { key: settingKey } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
  });

  it("upsert par cle, moindre privilege respecte, chaque ecriture journalisee", async () => {
    const superAdmin = await createUser("setting-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("setting-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const getMissing = await request(app)
      .get(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(getMissing.status).toBe(404);

    const createDeniedForAuditor = await request(app)
      .put(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ value: 14 });
    expect(createDeniedForAuditor.status).toBe(403);

    const created = await request(app)
      .put(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ value: 14 });
    expect(created.status).toBe(200);
    expect((created.body as { key: string; value: number }).value).toBe(14);
    const settingId = (created.body as { id: string }).id;

    const list = await request(app)
      .get("/api/v1/platform/platform-settings")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(list.status).toBe(200);
    expect((list.body as { key: string }[]).map((s) => s.key)).toContain(settingKey);

    const updated = await request(app)
      .put(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ value: 30 });
    expect(updated.status).toBe(200);
    expect((updated.body as { value: number }).value).toBe(30);
    expect((updated.body as { id: string }).id).toBe(settingId);

    const deleteDeniedForAuditor = await request(app)
      .delete(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(deleteDeniedForAuditor.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(deleted.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/v1/platform/platform-settings/${settingKey}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(getAfterDelete.status).toBe(404);

    const auditLogs = await request(app)
      .get("/api/v1/platform/audit-logs?entityType=PlatformSetting")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === settingId)
      .map((log) => log.action);
    expect(actions).toContain("platform_setting.create");
    expect(actions).toContain("platform_setting.update");
    expect(actions).toContain("platform_setting.delete");
  }, 20000);
});
