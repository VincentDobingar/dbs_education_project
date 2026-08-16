import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";
import { uniqueSuffix } from "../fixtures.js";

describe("vérification email/téléphone à l'inscription (§34)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("compte PENDING jusqu'à vérification, code téléphone incorrect refusé, email+téléphone activent tous deux le compte", async () => {
    const email = `verif-${uniqueSuffix()}@example.test`;
    const phone = `+237690${uniqueSuffix().slice(0, 6)}`;
    const password = "Sup3r-Secret-Passw0rd!";

    const registered = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password, firstName: "Test", lastName: "Verif", phone });
    expect(registered.status).toBe(201);
    const body = registered.body as {
      id: string;
      status: string;
      emailVerificationToken: string;
      phoneVerificationCode: string;
    };
    expect(body.status).toBe("PENDING");
    expect(body.emailVerificationToken).toBeTruthy();
    expect(body.phoneVerificationCode).toMatch(/^\d{6}$/);
    createdUserIds.push(body.id);

    const loginDenied = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loginDenied.status).toBe(403);
    expect((loginDenied.body as { code: string }).code).toBe("ACCOUNT_NOT_ACTIVE");

    const wrongCode = await request(app).post("/api/v1/auth/verify-phone").send({ email, code: "000000" });
    expect(wrongCode.status).toBe(401);
    expect((wrongCode.body as { code: string }).code).toBe("INVALID_VERIFICATION_CODE");

    const phoneVerified = await request(app)
      .post("/api/v1/auth/verify-phone")
      .send({ email, code: body.phoneVerificationCode });
    expect(phoneVerified.status).toBe(200);
    expect((phoneVerified.body as { status: string }).status).toBe("ACTIVE");

    const loginAllowed = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loginAllowed.status).toBe(200);
    expect((loginAllowed.body as { accessToken: string }).accessToken).toBeTruthy();

    const emailVerified = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: body.emailVerificationToken });
    expect(emailVerified.status).toBe(200);

    const emailReplay = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: body.emailVerificationToken });
    expect(emailReplay.status).toBe(404);
    expect((emailReplay.body as { code: string }).code).toBe("VERIFICATION_TOKEN_NOT_FOUND");

    const dbUser = await testAdminPrisma.user.findUniqueOrThrow({ where: { id: body.id } });
    expect(dbUser.emailVerifiedAt).not.toBeNull();
    expect(dbUser.phoneVerifiedAt).not.toBeNull();
  });

  it("jeton email expiré refusé, renvoi d'un nouveau jeton fonctionne", async () => {
    const email = `verif-expired-${uniqueSuffix()}@example.test`;
    const password = "Sup3r-Secret-Passw0rd!";

    const registered = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password, firstName: "Test", lastName: "Expired" });
    expect(registered.status).toBe(201);
    const body = registered.body as { id: string; emailVerificationToken: string };
    createdUserIds.push(body.id);

    await testAdminPrisma.user.update({
      where: { id: body.id },
      data: { emailVerificationExpiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: body.emailVerificationToken });
    expect(expired.status).toBe(410);
    expect((expired.body as { code: string }).code).toBe("VERIFICATION_TOKEN_EXPIRED");

    const resent = await request(app).post("/api/v1/auth/resend-email-verification").send({ email });
    expect(resent.status).toBe(200);
    const newToken = (resent.body as { emailVerificationToken: string }).emailVerificationToken;
    expect(newToken).not.toBe(body.emailVerificationToken);

    const verified = await request(app).post("/api/v1/auth/verify-email").send({ token: newToken });
    expect(verified.status).toBe(200);
    expect((verified.body as { status: string }).status).toBe("ACTIVE");

    const loginAllowed = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(loginAllowed.status).toBe(200);
  });

  it("refuse un email/téléphone déjà utilisé, et le renvoi de code sans téléphone sur le compte", async () => {
    const email = `verif-dup-${uniqueSuffix()}@example.test`;
    const phone = `+237691${uniqueSuffix().slice(0, 6)}`;
    const password = "Sup3r-Secret-Passw0rd!";

    const registered = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password, firstName: "Test", lastName: "Dup", phone });
    expect(registered.status).toBe(201);
    createdUserIds.push((registered.body as { id: string }).id);

    const dupEmail = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password, firstName: "Autre", lastName: "Personne" });
    expect(dupEmail.status).toBe(409);
    expect((dupEmail.body as { code: string }).code).toBe("EMAIL_ALREADY_REGISTERED");

    const dupPhone = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `verif-dup2-${uniqueSuffix()}@example.test`,
        password,
        firstName: "Autre",
        lastName: "Personne",
        phone,
      });
    expect(dupPhone.status).toBe(409);
    expect((dupPhone.body as { code: string }).code).toBe("PHONE_ALREADY_REGISTERED");

    const noPhoneEmail = `verif-nophone-${uniqueSuffix()}@example.test`;
    const noPhoneRegistered = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: noPhoneEmail, password, firstName: "Sans", lastName: "Telephone" });
    createdUserIds.push((noPhoneRegistered.body as { id: string }).id);

    const resendNoPhone = await request(app)
      .post("/api/v1/auth/resend-phone-verification")
      .send({ email: noPhoneEmail });
    expect(resendNoPhone.status).toBe(400);
    expect((resendNoPhone.body as { code: string }).code).toBe("PHONE_NOT_SET");
  });
});
