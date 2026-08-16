import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, createUser, grantRole } from "../fixtures.js";

describe("super-administration — élévation temporaire limitée dans le temps (§31 tranche 11)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("accorde un rôle tenant borné dans le temps, refuse le doublon actif, révocation anticipée journalisée", async () => {
    const { tenant } = await createTenant("ElevationTenant");
    createdTenantIds.push(tenant.id);

    const superAdmin = await createUser("elevation-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("elevation-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const deniedForAuditor = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevate`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({
        roleCode: "SCHOOL_ADMIN",
        durationHours: 4,
        justification: "Investigation ticket support #42",
      });
    expect(deniedForAuditor.status).toBe(403);

    const platformRoleDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ roleCode: "SUPER_ADMIN", durationHours: 4, justification: "Test" });
    expect(platformRoleDenied.status).toBe(400);
    expect((platformRoleDenied.body as { code: string }).code).toBe("INVALID_ROLE_SCOPE");

    const tooLong = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ roleCode: "SCHOOL_ADMIN", durationHours: 200, justification: "Test" });
    expect(tooLong.status).toBe(400);

    const elevated = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        roleCode: "SCHOOL_ADMIN",
        durationHours: 4,
        justification: "Investigation ticket support #42",
      });
    expect(elevated.status).toBe(201);
    const elevationId = (elevated.body as { id: string }).id;
    expect((elevated.body as { expiresAt: string | null }).expiresAt).not.toBeNull();

    const duplicateDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ roleCode: "SCHOOL_ADMIN", durationHours: 4, justification: "Nouvelle tentative" });
    expect(duplicateDenied.status).toBe(409);
    expect((duplicateDenied.body as { code: string }).code).toBe("ELEVATION_ALREADY_ACTIVE");

    const list = await request(app)
      .get(`/api/v1/platform/tenants/${tenant.id}/elevations`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).map((e) => e.id)).toContain(elevationId);

    const revokeDeniedForAuditor = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevations/${elevationId}/revoke`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ justification: "Fin d'investigation" });
    expect(revokeDeniedForAuditor.status).toBe(403);

    const revoked = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevations/${elevationId}/revoke`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Fin d'investigation" });
    expect(revoked.status).toBe(204);

    const revokeAgainDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/elevations/${elevationId}/revoke`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Encore" });
    expect(revokeAgainDenied.status).toBe(409);
    expect((revokeAgainDenied.body as { code: string }).code).toBe("ELEVATION_ALREADY_EXPIRED");

    const activeRow = await testAdminPrisma.userRole.findUnique({ where: { id: elevationId } });
    expect(activeRow?.expiresAt).not.toBeNull();
    expect((activeRow?.expiresAt as Date).getTime()).toBeLessThanOrEqual(Date.now());

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=UserRole`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === elevationId)
      .map((log) => log.action);
    expect(actions).toContain("platform_elevation.grant");
    expect(actions).toContain("platform_elevation.revoke");
  }, 20000);
});
