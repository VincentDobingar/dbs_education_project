import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { rawPrisma } from "../lib/prisma.js";

describe("GET /api/v1/health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with an ok status when Postgres is reachable (Redis skipped in test — no instance provisioned)", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      dependencies: { postgres: "ok", redis: "skipped" },
    });
  });

  it("returns 503 degraded when Postgres is unreachable, instead of a silent 200 (audit design/sécu 2026-09-22)", async () => {
    vi.spyOn(rawPrisma, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));

    const app = createApp();
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      dependencies: { postgres: "down" },
    });
  });
});
