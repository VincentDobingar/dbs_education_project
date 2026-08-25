import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { testAdminPrisma } from "../admin-client.js";
import { createUser } from "../fixtures.js";

const PASSWORD = "Sup3r-Secret-Passw0rd!";

interface SessionEntry {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
}

// §15/§34 : « voir les appareils connectés » / « révoquer une session » — Session
// portait déjà les colonnes nécessaires (userAgent, ipAddress, revokedAt) depuis la
// Phase 2, mais rien ne les exposait : logout ne pouvait révoquer que la session
// dont le refresh token était présenté, jamais une liste consultable ni une session
// choisie par id (ex. un appareil volé, dont le refresh token n'est plus sous la
// main).
describe("appareils connectés et révocation de session (§15/§34)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("lists active sessions across two logins and revokes one by id, without exposing the refresh token hash", async () => {
    const user = await createUser("sessions-owner");
    createdUserIds.push(user.id);

    const firstLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("User-Agent", "Desktop Browser")
      .send({ email: user.email, password: PASSWORD });
    expect(firstLogin.status).toBe(200);

    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("User-Agent", "Mobile App")
      .send({ email: user.email, password: PASSWORD });
    expect(secondLogin.status).toBe(200);
    const accessToken = (secondLogin.body as { accessToken: string }).accessToken;

    const denied = await request(app).get("/api/v1/auth/sessions");
    expect(denied.status).toBe(401);

    const list = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    const sessions = list.body as (SessionEntry & { refreshTokenHash?: string })[];
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.userAgent)).toEqual(
      expect.arrayContaining(["Desktop Browser", "Mobile App"]),
    );
    expect(sessions.every((s) => s.refreshTokenHash === undefined)).toBe(true);

    const desktopSession = sessions.find((s) => s.userAgent === "Desktop Browser");

    const revoked = await request(app)
      .post(`/api/v1/auth/sessions/${desktopSession?.id}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(revoked.status).toBe(204);

    const afterRevoke = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(afterRevoke.body as SessionEntry[]).toHaveLength(1);
    expect((afterRevoke.body as SessionEntry[])[0]?.userAgent).toBe("Mobile App");
  });

  it("refuses to revoke another user's session (never confirms it exists)", async () => {
    const owner = await createUser("sessions-victim");
    const attacker = await createUser("sessions-attacker");
    createdUserIds.push(owner.id, attacker.id);

    const ownerLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: PASSWORD });
    const ownerAccessToken = (ownerLogin.body as { accessToken: string }).accessToken;

    const ownerSessions = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${ownerAccessToken}`);
    const ownerSessionId = (ownerSessions.body as SessionEntry[])[0]?.id;

    const attackerLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: attacker.email, password: PASSWORD });
    const attackerAccessToken = (attackerLogin.body as { accessToken: string }).accessToken;

    const attempt = await request(app)
      .post(`/api/v1/auth/sessions/${ownerSessionId}/revoke`)
      .set("Authorization", `Bearer ${attackerAccessToken}`);
    expect(attempt.status).toBe(404);
    expect((attempt.body as { code: string }).code).toBe("SESSION_NOT_FOUND");

    const stillActive = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${ownerAccessToken}`);
    expect(stillActive.body as SessionEntry[]).toHaveLength(1);
  });
});
