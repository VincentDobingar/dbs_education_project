import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("super-administration — modèles de notification (§31 tranche 6)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const templateCode = `WELCOME-${uniqueSuffix()}`;

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.messageTemplate.deleteMany({ where: { code: templateCode } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("gère les modèles globaux et par tenant — piège NULL couvert, doublons refusés, moindre privilège respecté", async () => {
    const { tenant } = await createTenant("MessageTemplateTenant");
    createdTenantIds.push(tenant.id);

    const superAdmin = await createUser("template-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("template-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const createDeniedForAuditor = await request(app)
      .post("/api/v1/platform/message-templates")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ code: templateCode, channel: "EMAIL", bodyFr: "Bienvenue", bodyEn: "Welcome" });
    expect(createDeniedForAuditor.status).toBe(403);

    const createdGlobal = await request(app)
      .post("/api/v1/platform/message-templates")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code: templateCode, channel: "EMAIL", bodyFr: "Bienvenue", bodyEn: "Welcome" });
    expect(createdGlobal.status).toBe(201);
    const globalTemplateId = (createdGlobal.body as { id: string }).id;

    const duplicateGlobal = await request(app)
      .post("/api/v1/platform/message-templates")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code: templateCode, channel: "SMS", bodyFr: "Autre", bodyEn: "Other" });
    expect(duplicateGlobal.status).toBe(409);
    expect((duplicateGlobal.body as { code: string }).code).toBe("MESSAGE_TEMPLATE_CODE_TAKEN");

    // Même code, mais scopé à un tenant : doit réussir (piège NULL vs valeur explicite).
    const createdTenantScoped = await request(app)
      .post("/api/v1/platform/message-templates")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        tenantId: tenant.id,
        code: templateCode,
        channel: "EMAIL",
        bodyFr: "Bienvenue (personnalisé)",
        bodyEn: "Welcome (custom)",
      });
    expect(createdTenantScoped.status).toBe(201);
    const tenantTemplateId = (createdTenantScoped.body as { id: string }).id;

    const duplicateTenantScoped = await request(app)
      .post("/api/v1/platform/message-templates")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ tenantId: tenant.id, code: templateCode, channel: "SMS", bodyFr: "X", bodyEn: "X" });
    expect(duplicateTenantScoped.status).toBe(409);

    const list = await request(app)
      .get(`/api/v1/platform/message-templates?tenantId=${tenant.id}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).map((t) => t.id)).toEqual([tenantTemplateId]);

    const updated = await request(app)
      .patch(`/api/v1/platform/message-templates/${globalTemplateId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ bodyFr: "Bienvenue chez EduManage" });
    expect(updated.status).toBe(200);
    expect((updated.body as { bodyFr: string }).bodyFr).toBe("Bienvenue chez EduManage");

    const deleteDeniedForAuditor = await request(app)
      .delete(`/api/v1/platform/message-templates/${tenantTemplateId}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(deleteDeniedForAuditor.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/v1/platform/message-templates/${tenantTemplateId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(deleted.status).toBe(204);

    const listAfterDelete = await request(app)
      .get(`/api/v1/platform/message-templates?tenantId=${tenant.id}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect((listAfterDelete.body as unknown[]).length).toBe(0);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=MessageTemplate`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === globalTemplateId || log.entityId === tenantTemplateId)
      .map((log) => log.action);
    expect(actions).toContain("message_template.create");
    expect(actions).toContain("message_template.update");
    expect(actions).toContain("message_template.delete");
  }, 20000);
});
