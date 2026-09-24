import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildRateLimiter } from "../../middleware/rateLimit.js";
import { buildTestApp, type TestResponseBody } from "../test-app.js";

/**
 * §34 : « limitation des requêtes » — apiRateLimiter/authRateLimiter eux-mêmes ne
 * peuvent jamais être observés « engagés » dans ce process (NODE_ENV=test les
 * désactive délibérément, voir rateLimit.ts) : ce test construit sa propre instance
 * avec `skip` désactivé pour prouver que le mécanisme sous-jacent bloque bien au-delà
 * de la limite, avec la forme de réponse attendue par le reste de l'API.
 */
describe("limitation de débit (§34)", () => {
  it("allows requests under the limit, then blocks with 429 once it is reached", async () => {
    const limiter = buildRateLimiter({ windowMs: 60_000, limit: 2, skip: () => false });
    const app = buildTestApp(limiter);

    const first = await request(app).get("/protected");
    expect(first.status).toBe(200);

    const second = await request(app).get("/protected");
    expect(second.status).toBe(200);

    const third = await request(app).get("/protected");
    expect(third.status).toBe(429);
    expect((third.body as TestResponseBody).code).toBe("RATE_LIMITED");
  });

  /**
   * `logoUploadRateLimiter` (tenant.routes.ts) keys by `req.user.id` rather than
   * IP — a pre-onboarding account has no tenant yet to scope the endpoint by, so a
   * per-user counter is the only thing stopping one authenticated account from
   * looping on it indefinitely. Proven here with a fake auth middleware rather
   * than the full app, same isolation style as the test above it.
   */
  it("keys by user id (via keyGenerator) rather than IP, so two users share no counter", async () => {
    function fakeAuth(req: Request, _res: Response, next: NextFunction): void {
      req.user = { id: req.header("x-test-user-id") ?? "anonymous", email: "", status: "ACTIVE" };
      next();
    }
    const limiter = buildRateLimiter({
      windowMs: 60_000,
      limit: 1,
      skip: () => false,
      keyGenerator: (req) => req.user?.id ?? "anonymous",
    });
    const app = buildTestApp(fakeAuth, limiter);

    const userAFirst = await request(app).get("/protected").set("x-test-user-id", "user-a");
    expect(userAFirst.status).toBe(200);
    const userASecond = await request(app).get("/protected").set("x-test-user-id", "user-a");
    expect(userASecond.status).toBe(429);

    // A different user, same IP (both hit the in-process test server) is unaffected.
    const userBFirst = await request(app).get("/protected").set("x-test-user-id", "user-b");
    expect(userBFirst.status).toBe(200);
  });

  /**
   * `resendVerificationRateLimiter` (rateLimit.ts, passe d'audit n°27) keys by the
   * targeted email from the request body, not by caller IP — proven here the same
   * way as the keyGenerator test above: the targeted email stays limited even
   * across what would be different callers, since the body, not the connection,
   * carries the identity that matters.
   */
  it("resend-verification limiter keys by the targeted email in the body, not by caller identity", async () => {
    const limiter = buildRateLimiter({
      windowMs: 60_000,
      limit: 1,
      skip: () => false,
      keyGenerator: (req) => {
        const email = (req.body as { email?: unknown } | undefined)?.email;
        return typeof email === "string" ? email.trim().toLowerCase() : "unknown";
      },
    });
    const app = buildTestApp(limiter);

    const first = await request(app).get("/protected").send({ email: "Target@Example.test" });
    expect(first.status).toBe(200);
    const second = await request(app).get("/protected").send({ email: "target@example.test" });
    expect(second.status).toBe(429);

    const differentTarget = await request(app).get("/protected").send({ email: "other@example.test" });
    expect(differentTarget.status).toBe(200);
  });
});
