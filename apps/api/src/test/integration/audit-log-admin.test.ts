import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, createUser, grantRole } from "../fixtures.js";

describe("journal d'audit — export et purge (§31)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    // Les entrées "audit_log.purge" journalisent la purge elle-même avec tenantId
    // null (action plateforme) — pas couvertes par le nettoyage ci-dessus.
    await testAdminPrisma.auditLog.deleteMany({
      where: { action: "audit_log.purge", actorUserId: { in: createdUserIds } },
    });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  async function setUpActors(): Promise<{ superAdminToken: string; auditorToken: string }> {
    const superAdmin = await createUser("audit-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);

    const auditor = await createUser("audit-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);

    return {
      superAdminToken: signAccessToken({ sub: superAdmin.id }),
      auditorToken: signAccessToken({ sub: auditor.id }),
    };
  }

  it("exporte les journaux d'audit en CSV et en XLSX, filtrés par fenêtre de dates", async () => {
    const { superAdminToken } = await setUpActors();
    const { tenant } = await createTenant("AuditExport");
    createdTenantIds.push(tenant.id);

    const suspend = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ justification: "test export" });
    expect(suspend.status).toBe(200);

    const today = new Date().toISOString().slice(0, 10);
    const csv = await request(app)
      .get(`/api/v1/platform/audit-logs/export.csv?tenantId=${tenant.id}&startDate=${today}&endDate=${today}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("tenant.suspend");

    const xlsx = await request(app)
      .get(
        `/api/v1/platform/audit-logs/export.xlsx?tenantId=${tenant.id}&startDate=${today}&endDate=${today}`,
      )
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect((xlsx.body as Buffer).length).toBeGreaterThan(0);

    // Hors fenêtre : aucune ligne pour cette action.
    const outOfRange = await request(app)
      .get(
        `/api/v1/platform/audit-logs/export.csv?tenantId=${tenant.id}&startDate=2000-01-01&endDate=2000-01-02`,
      )
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(outOfRange.status).toBe(200);
    expect(outOfRange.text).not.toContain("tenant.suspend");
  });

  it("refuse l'export sans startDate/endDate", async () => {
    const { superAdminToken } = await setUpActors();
    const response = await request(app)
      .get("/api/v1/platform/audit-logs/export.csv")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(response.status).toBe(400);
  });

  it("purge : réservée à SUPER_ADMIN, refuse un seuil sous 365 jours, journalise la purge elle-même", async () => {
    const { superAdminToken, auditorToken } = await setUpActors();

    const deniedForAuditor = await request(app)
      .post("/api/v1/platform/audit-logs/purge")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ olderThanDays: 400, justification: "nettoyage" });
    expect(deniedForAuditor.status).toBe(403);

    const belowFloor = await request(app)
      .post("/api/v1/platform/audit-logs/purge")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ olderThanDays: 30, justification: "nettoyage" });
    expect(belowFloor.status).toBe(400);

    const missingJustification = await request(app)
      .post("/api/v1/platform/audit-logs/purge")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ olderThanDays: 400 });
    expect(missingJustification.status).toBe(400);

    const purged = await request(app)
      .post("/api/v1/platform/audit-logs/purge")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ olderThanDays: 400, justification: "nettoyage annuel" });
    expect(purged.status).toBe(200);
    const body = purged.body as { deletedCount: number; cutoffDate: string };
    expect(body.deletedCount).toBe(0); // rien de plus vieux que 400 jours dans ce run de test
    expect(body.cutoffDate).toBeTruthy();

    // La purge elle-même est journalisée (tenantId null, action platform).
    const purgeLog = await testAdminPrisma.auditLog.findFirst({
      where: { action: "audit_log.purge", entityId: "bulk" },
      orderBy: { createdAt: "desc" },
    });
    expect(purgeLog).not.toBeNull();
    expect(purgeLog?.justification).toBe("nettoyage annuel");
  });
});
