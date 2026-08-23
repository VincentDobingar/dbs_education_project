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
});
