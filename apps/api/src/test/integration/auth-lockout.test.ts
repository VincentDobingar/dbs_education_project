import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser } from "../fixtures.js";

const KNOWN_PASSWORD = "Sup3r-Secret-Passw0rd!";

describe("verrouillage de compte et énumération à la connexion (§34, audit pass 24)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("verrouille après 5 échecs, mais ne l'expose jamais au client — 401 identique à un mauvais mot de passe ou un compte inexistant", async () => {
    const user = await createUser("lockout");
    createdUserIds.push(user.id);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failed = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "wrong-password" });
      expect(failed.status).toBe(401);
      expect((failed.body as { code: string }).code).toBe("INVALID_CREDENTIALS");
    }

    const lockedInDb = await testAdminPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(lockedInDb.lockedUntil).not.toBeNull();
    expect((lockedInDb.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());

    // Locked out server-side (proven above), but the CORRECT password is still
    // rejected with the exact same 401/INVALID_CREDENTIALS shape a client sees for a
    // wrong password or a nonexistent account — never a distinct 423 ACCOUNT_LOCKED.
    const correctPasswordWhileLocked = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: KNOWN_PASSWORD });
    expect(correctPasswordWhileLocked.status).toBe(401);
    expect((correctPasswordWhileLocked.body as { code: string }).code).toBe("INVALID_CREDENTIALS");

    const nonexistent = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "no-such-account@example.test", password: "whatever" });
    expect(nonexistent.status).toBe(401);
    expect((nonexistent.body as { code: string }).code).toBe("INVALID_CREDENTIALS");
  });

  it("un compte non verrouillé se connecte normalement avec le bon mot de passe", async () => {
    const user = await createUser("lockout-ok");
    createdUserIds.push(user.id);

    const success = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: KNOWN_PASSWORD });
    expect(success.status).toBe(200);
    expect((success.body as { accessToken?: string }).accessToken).toBeTruthy();
  });
});
