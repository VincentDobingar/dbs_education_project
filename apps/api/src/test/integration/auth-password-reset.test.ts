import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import {
  registerEmailProviderAdapter,
  resetEmailProviderAdapter,
} from "../../lib/email-provider/registry.js";
import type { EmailProviderAdapter, SendEmailInput } from "../../lib/email-provider/types.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser } from "../fixtures.js";

const OLD_PASSWORD = "Sup3r-Secret-Passw0rd!";
const NEW_PASSWORD = "Nouveau-Mot-De-Passe-2026";

describe("mot de passe oublié — lien par e-mail, usage unique, sessions révoquées", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  let sent: SendEmailInput[] = [];

  beforeEach(() => {
    sent = [];
    const adapter: EmailProviderAdapter = {
      code: "FAKE",
      send: (input) => {
        sent.push(input);
        return Promise.resolve();
      },
    };
    registerEmailProviderAdapter(adapter);
  });

  afterEach(() => {
    resetEmailProviderAdapter();
  });

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  function tokenFrom(email: SendEmailInput): string {
    const match = /#token=([A-Za-z0-9_-]+)/.exec(email.text);
    expect(match, "lien de réinitialisation dans l'e-mail").not.toBeNull();
    return match![1]!;
  }

  it("envoie le lien seulement par e-mail et répond pareil pour un compte inconnu", async () => {
    const user = await createUser("reset-request");
    createdUserIds.push(user.id);

    const known = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email, space: "portal", locale: "fr" });
    const unknown = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "personne-ici@example.test" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toContain("token");

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(user.email);
    expect(sent[0]!.text).toContain("/reinitialiser-mot-de-passe?espace=portal#token=");
  });

  it("change le mot de passe, révoque les sessions, et refuse de réutiliser le lien", async () => {
    const user = await createUser("reset-flow");
    createdUserIds.push(user.id);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: OLD_PASSWORD });
    expect(login.status).toBe(200);
    const { refreshToken } = login.body as { refreshToken: string };

    await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
    const token = tokenFrom(sent[0]!);

    const tooShort = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "court" });
    expect(tooShort.status).toBe(400);

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Ancienne session révoquée, ancien mot de passe refusé, nouveau accepté.
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: user.email, password: OLD_PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: user.email, password: NEW_PASSWORD }))
        .status,
    ).toBe(200);

    const reused = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(reused.status).toBe(404);
    expect((reused.body as { code: string }).code).toBe("PASSWORD_RESET_TOKEN_INVALID");

    // Confirmation envoyée et intervention tracée.
    expect(sent.at(-1)!.subject).toBe("Votre mot de passe a été modifié");
    const audit = await testAdminPrisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: "AUTH_PASSWORD_RESET" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuse un lien expiré et lève le verrouillage après réinitialisation", async () => {
    const user = await createUser("reset-expired");
    createdUserIds.push(user.id);

    await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
    const expiredToken = tokenFrom(sent[0]!);
    await testAdminPrisma.user.update({
      where: { id: user.id },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: expiredToken, password: NEW_PASSWORD });
    expect(expired.status).toBe(410);

    await testAdminPrisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });
    await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: tokenFrom(sent.at(-1)!), password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: user.email, password: NEW_PASSWORD }))
        .status,
    ).toBe(200);
  });
});
