import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

describe("super-administration — établissements et audit (§31)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({
      where: {
        OR: [{ tenantId: { in: createdTenantIds } }, { userId: { in: createdUserIds }, tenantId: null }],
      },
    });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("liste, vérifie, rejette, suspend et réactive des établissements — chaque action journalisée", async () => {
    const { tenant: tenantA } = await createTenant("PlatformTenantA");
    const { tenant: tenantB } = await createTenant("PlatformTenantB");
    const { tenant: tenantC } = await createTenant("PlatformTenantC");
    createdTenantIds.push(tenantA.id, tenantB.id, tenantC.id);

    await testAdminPrisma.tenant.update({
      where: { id: tenantA.id },
      data: { status: "PENDING_VERIFICATION" },
    });
    await testAdminPrisma.tenant.update({
      where: { id: tenantB.id },
      data: { status: "PENDING_VERIFICATION" },
    });

    const superAdmin = await createUser("plat-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("plat-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const ordinaryUser = await createUser("plat-ordinary");
    createdUserIds.push(ordinaryUser.id);
    await addMembership(ordinaryUser.id, tenantC.id);
    await grantRole(ordinaryUser.id, "SCHOOL_OWNER", tenantC.id);
    const ordinaryToken = signAccessToken({ sub: ordinaryUser.id });

    const deniedList = await request(app)
      .get("/api/v1/platform/tenants")
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(deniedList.status).toBe(403);
    expect((deniedList.body as { code: string }).code).toBe("PLATFORM_ROLE_REQUIRED");

    const auditorList = await request(app)
      .get("/api/v1/platform/tenants")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(auditorList.status).toBe(200);
    expect((auditorList.body as { id: string }[]).some((t) => t.id === tenantA.id)).toBe(true);

    const auditorMutationDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA.id}/verify`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ justification: "Vérification des documents" });
    expect(auditorMutationDenied.status).toBe(403);

    const missingJustification = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA.id}/verify`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({});
    expect(missingJustification.status).toBe(400);

    const verified = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA.id}/verify`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Documents d'agrément conformes" });
    expect(verified.status).toBe(200);
    expect((verified.body as { status: string }).status).toBe("VERIFIED");

    const reverifyDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenantA.id}/verify`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Nouvelle tentative" });
    expect(reverifyDenied.status).toBe(409);
    expect((reverifyDenied.body as { code: string }).code).toBe("TENANT_NOT_PENDING_VERIFICATION");

    const rejected = await request(app)
      .post(`/api/v1/platform/tenants/${tenantB.id}/reject`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Numéro d'agrément invalide" });
    expect(rejected.status).toBe(200);
    expect((rejected.body as { status: string }).status).toBe("REJECTED");

    const suspended = await request(app)
      .post(`/api/v1/platform/tenants/${tenantC.id}/suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Impayé constaté" });
    expect(suspended.status).toBe(200);
    expect((suspended.body as { status: string }).status).toBe("SUSPENDED");
    expect((suspended.body as { suspendedReason: string }).suspendedReason).toBe("Impayé constaté");

    const suspendAgainDenied = await request(app)
      .post(`/api/v1/platform/tenants/${tenantC.id}/suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Encore" });
    expect(suspendAgainDenied.status).toBe(409);
    expect((suspendAgainDenied.body as { code: string }).code).toBe("TENANT_NOT_SUSPENDABLE");

    const reactivated = await request(app)
      .post(`/api/v1/platform/tenants/${tenantC.id}/reactivate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "Paiement régularisé" });
    expect(reactivated.status).toBe(200);
    expect((reactivated.body as { status: string }).status).toBe("ACTIVE");
    expect((reactivated.body as { suspendedReason: string | null }).suspendedReason).toBeNull();

    const auditLogsDenied = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenantC.id}`)
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(auditLogsDenied.status).toBe(403);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenantC.id}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (
      auditLogs.body as { action: string; justification: string; actorRoleCode: string }[]
    ).map((log) => log.action);
    expect(actions).toContain("tenant.suspend");
    expect(actions).toContain("tenant.reactivate");
    const suspendLog = (
      auditLogs.body as { action: string; justification: string; actorRoleCode: string }[]
    ).find((log) => log.action === "tenant.suspend");
    expect(suspendLog?.justification).toBe("Impayé constaté");
    expect(suspendLog?.actorRoleCode).toBe("SUPER_ADMIN");
  }, 20000);
});
