import { generate } from "otplib";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";
import { uniqueSuffix } from "../fixtures.js";

async function registerAndActivate(app: ReturnType<typeof createApp>): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const email = `mfa-${uniqueSuffix()}@example.test`;
  const password = "Sup3r-Secret-Passw0rd!";

  const registered = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password, firstName: "Test", lastName: "Mfa" });
  const body = registered.body as { id: string; emailVerificationToken: string };

  await request(app).post("/api/v1/auth/verify-email").send({ token: body.emailVerificationToken });

  return { id: body.id, email, password };
}

describe("authentification multifacteur (§34)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.mfaRecoveryCode.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("mise en place, activation, défi au login, codes de secours, désactivation", async () => {
    const { id: userId, email, password } = await registerAndActivate(app);
    createdUserIds.push(userId);

    const firstLogin = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(firstLogin.status).toBe(200);
    const accessToken = (firstLogin.body as { accessToken: string }).accessToken;

    const setup = await request(app)
      .post("/api/v1/auth/mfa/setup")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(setup.status).toBe(200);
    const { secret, otpauthUri } = setup.body as { secret: string; otpauthUri: string };
    expect(otpauthUri).toContain("otpauth://totp/");

    const wrongEnable = await request(app)
      .post("/api/v1/auth/mfa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "000000" });
    expect(wrongEnable.status).toBe(401);
    expect((wrongEnable.body as { code: string }).code).toBe("INVALID_MFA_CODE");

    const validCode = await generate({ secret });
    const enabled = await request(app)
      .post("/api/v1/auth/mfa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: validCode });
    expect(enabled.status).toBe(200);
    const recoveryCodes = (enabled.body as { recoveryCodes: string[] }).recoveryCodes;
    expect(recoveryCodes).toHaveLength(8);

    const setupAgainDenied = await request(app)
      .post("/api/v1/auth/mfa/setup")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(setupAgainDenied.status).toBe(409);
    expect((setupAgainDenied.body as { code: string }).code).toBe("MFA_ALREADY_ENABLED");

    const loginWithMfa = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loginWithMfa.status).toBe(200);
    const challenge = loginWithMfa.body as { mfaRequired: boolean; challengeToken: string };
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.challengeToken).toBeTruthy();

    // Le jeton de défi ne vaut pas un accès complet — un endpoint requireAuth le rejette.
    const challengeAsAccessToken = await request(app)
      .post("/api/v1/auth/mfa/setup")
      .set("Authorization", `Bearer ${challenge.challengeToken}`);
    expect(challengeAsAccessToken.status).toBe(401);

    const wrongVerify = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: challenge.challengeToken, code: "000000" });
    expect(wrongVerify.status).toBe(401);
    expect((wrongVerify.body as { code: string }).code).toBe("INVALID_MFA_CODE");

    const verifyCode = await generate({ secret });
    const verified = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: challenge.challengeToken, code: verifyCode });
    expect(verified.status).toBe(200);
    const mfaAccessToken = (verified.body as { accessToken: string }).accessToken;
    expect(mfaAccessToken).toBeTruthy();

    // Un second login MFA vérifié avec un code de secours plutôt qu'un TOTP.
    const secondLogin = await request(app).post("/api/v1/auth/login").send({ email, password });
    const secondChallenge = secondLogin.body as { challengeToken: string };
    const recoveryCode = recoveryCodes[0] as string;

    const verifiedWithRecovery = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: secondChallenge.challengeToken, code: recoveryCode });
    expect(verifiedWithRecovery.status).toBe(200);

    // Ce code de secours est désormais consommé — refusé une seconde fois.
    const thirdLogin = await request(app).post("/api/v1/auth/login").send({ email, password });
    const thirdChallenge = thirdLogin.body as { challengeToken: string };
    const recoveryReplay = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: thirdChallenge.challengeToken, code: recoveryCode });
    expect(recoveryReplay.status).toBe(401);

    // Désactivation : mauvais mot de passe refusé, puis mot de passe + code valides.
    const disableWrongPassword = await request(app)
      .post("/api/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${mfaAccessToken}`)
      .send({ password: "wrong-password", code: await generate({ secret }) });
    expect(disableWrongPassword.status).toBe(401);
    expect((disableWrongPassword.body as { code: string }).code).toBe("INVALID_CREDENTIALS");

    const disabled = await request(app)
      .post("/api/v1/auth/mfa/disable")
      .set("Authorization", `Bearer ${mfaAccessToken}`)
      .send({ password, code: await generate({ secret }) });
    expect(disabled.status).toBe(204);

    const loginAfterDisable = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loginAfterDisable.status).toBe(200);
    expect((loginAfterDisable.body as { accessToken?: string }).accessToken).toBeTruthy();

    const dbUser = await testAdminPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(dbUser.mfaEnabled).toBe(false);
    expect(dbUser.mfaSecretCiphertext).toBeNull();
  }, 20000);

  it("refuse d'activer sans mise en place préalable", async () => {
    const { id: userId, email, password } = await registerAndActivate(app);
    createdUserIds.push(userId);

    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const accessToken = (login.body as { accessToken: string }).accessToken;

    const enableWithoutSetup = await request(app)
      .post("/api/v1/auth/mfa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "123456" });
    expect(enableWithoutSetup.status).toBe(409);
    expect((enableWithoutSetup.body as { code: string }).code).toBe("MFA_SETUP_REQUIRED");
  });
});
