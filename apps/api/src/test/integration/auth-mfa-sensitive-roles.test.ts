import { generate } from "otplib";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../env.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

const PASSWORD = "Sup3r-Secret-Passw0rd!";

describe("MFA obligatoire pour rôles sensibles (§34)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  it("autorise le contournement temporaire uniquement en développement", async () => {
    const user = await createUser("mfa-local-bypass");
    createdUserIds.push(user.id);
    await testAdminPrisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    const previous = { nodeEnv: env.NODE_ENV, skip: env.DEV_SKIP_MFA };
    try {
      env.DEV_SKIP_MFA = true;
      env.NODE_ENV = "development";
      const local = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: PASSWORD });
      const localBody = local.body as { accessToken?: string; mfaRequired?: boolean };
      expect(localBody.accessToken).toBeTruthy();
      expect(localBody.mfaRequired).toBeUndefined();
      env.NODE_ENV = "production";
      const production = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: PASSWORD });
      const productionBody = production.body as { accessToken?: string; mfaRequired?: boolean };
      expect(productionBody.mfaRequired).toBe(true);
      expect(productionBody.accessToken).toBeUndefined();
    } finally {
      env.NODE_ENV = previous.nodeEnv;
      env.DEV_SKIP_MFA = previous.skip;
    }
  });

  afterAll(async () => {
    await testAdminPrisma.mfaRecoveryCode.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("bloque la session tant qu'un rôle sensible (SCHOOL_OWNER) n'a pas activé le MFA, puis laisse passer une fois enrôlé", async () => {
    const { tenant } = await createTenant("MfaSensitive");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("mfa-owner");
    createdUserIds.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const firstLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: PASSWORD });
    expect(firstLogin.status).toBe(200);
    const enrollment = firstLogin.body as {
      mfaEnrollmentRequired?: boolean;
      enrollmentToken?: string;
      accessToken?: string;
    };
    expect(enrollment.mfaEnrollmentRequired).toBe(true);
    expect(enrollment.enrollmentToken).toBeTruthy();
    expect(enrollment.accessToken).toBeUndefined();
    const enrollmentToken = enrollment.enrollmentToken as string;

    // Le jeton d'enrôlement ne vaut pas un accès complet — un endpoint requireAuth ordinaire le rejette.
    const enrollmentAsAccessToken = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${enrollmentToken}`);
    expect(enrollmentAsAccessToken.status).toBe(401);

    // Mais il suffit à parcourir /mfa/setup puis /mfa/enable.
    const setup = await request(app)
      .post("/api/v1/auth/mfa/setup")
      .set("Authorization", `Bearer ${enrollmentToken}`);
    expect(setup.status).toBe(200);
    const { secret } = setup.body as { secret: string };

    const validCode = await generate({ secret });
    const enabled = await request(app)
      .post("/api/v1/auth/mfa/enable")
      .set("Authorization", `Bearer ${enrollmentToken}`)
      .send({ code: validCode });
    expect(enabled.status).toBe(200);
    expect((enabled.body as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(8);

    // Une fois enrôlé, la reconnexion redevient le défi MFA normal (jamais une session directe).
    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: PASSWORD });
    expect(secondLogin.status).toBe(200);
    const challenge = secondLogin.body as { mfaRequired?: boolean; challengeToken?: string };
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.challengeToken).toBeTruthy();

    const verifyCode = await generate({ secret });
    const verified = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: challenge.challengeToken, code: verifyCode });
    expect(verified.status).toBe(200);
    expect((verified.body as { accessToken?: string }).accessToken).toBeTruthy();
  }, 20000);

  it("ne force pas le MFA pour un rôle non sensible (TEACHER)", async () => {
    const { tenant } = await createTenant("MfaNonSensitive");
    createdTenantIds.push(tenant.id);

    const teacher = await createUser("mfa-teacher");
    createdUserIds.push(teacher.id);
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: teacher.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const body = login.body as { accessToken?: string; mfaEnrollmentRequired?: boolean };
    expect(body.accessToken).toBeTruthy();
    expect(body.mfaEnrollmentRequired).toBeUndefined();
  });

  it("force aussi le MFA pour un rôle plateforme (SUPPORT_AGENT, sans tenant)", async () => {
    const agent = await createUser("mfa-support");
    createdUserIds.push(agent.id);
    await grantRole(agent.id, "SUPPORT_AGENT", null);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: agent.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect((login.body as { mfaEnrollmentRequired?: boolean }).mfaEnrollmentRequired).toBe(true);
  });
});
