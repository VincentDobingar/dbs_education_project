import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("super-administration — codes promotionnels (§31 tranche 4)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdCodes: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.promotionCode.deleteMany({ where: { code: { in: createdCodes } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
  });

  it("gère les codes promotionnels — doublons refusés, bornes de remise validées, moindre privilège respecté", async () => {
    const superAdmin = await createUser("promo-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("promo-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const ordinary = await createUser("promo-ordinary");
    createdUserIds.push(ordinary.id);
    const ordinaryToken = signAccessToken({ sub: ordinary.id });

    const listDenied = await request(app)
      .get("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(listDenied.status).toBe(403);

    const code = `PROMO-TEST-${uniqueSuffix()}`;
    createdCodes.push(code);

    const invalidPercentage = await request(app)
      .post("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code, discountType: "PERCENTAGE", discountValue: 150 });
    expect(invalidPercentage.status).toBe(400);

    const createDeniedForAuditor = await request(app)
      .post("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ code, discountType: "PERCENTAGE", discountValue: 10 });
    expect(createDeniedForAuditor.status).toBe(403);

    const created = await request(app)
      .post("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        code,
        descriptionFr: "Remise de rentrée",
        discountType: "PERCENTAGE",
        discountValue: 15,
        applicableCategory: "SCHOOL",
      });
    expect(created.status).toBe(201);
    const promotionCodeId = (created.body as { id: string }).id;

    const duplicate = await request(app)
      .post("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code, discountType: "FIXED_AMOUNT", discountValue: 500 });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("PROMOTION_CODE_TAKEN");

    const listCodes = await request(app)
      .get("/api/v1/platform/promotion-codes")
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(listCodes.status).toBe(200);
    expect((listCodes.body as { code: string }[]).some((c) => c.code === code)).toBe(true);

    const updateDeniedForAuditor = await request(app)
      .patch(`/api/v1/platform/promotion-codes/${promotionCodeId}`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ isActive: false });
    expect(updateDeniedForAuditor.status).toBe(403);

    const updated = await request(app)
      .patch(`/api/v1/platform/promotion-codes/${promotionCodeId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(updated.status).toBe(200);
    expect((updated.body as { isActive: boolean }).isActive).toBe(false);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=PromotionCode`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === promotionCodeId)
      .map((log) => log.action);
    expect(actions).toContain("promotion_code.create");
    expect(actions).toContain("promotion_code.update");
  }, 20000);
});
