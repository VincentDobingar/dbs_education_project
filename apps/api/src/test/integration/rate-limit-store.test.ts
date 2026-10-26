import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRateLimiter } from "../../middleware/rateLimit.js";

const { counters } = vi.hoisted(() => ({ counters: new Map<string, number>() }));
vi.mock("../../env.js", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("../../lib/redis.js", () => ({ getRedisClient: () => ({ call: vi.fn() }) }));
// Redis partagé simulé : des stores différents partagent réellement leurs clés.
vi.mock("rate-limit-redis", () => ({
  RedisStore: class {
    localKeys = false;
    prefix: string;
    constructor(options: { prefix: string }) {
      this.prefix = options.prefix;
    }
    increment(key: string) {
      const id = this.prefix + key;
      const hits = (counters.get(id) ?? 0) + 1;
      counters.set(id, hits);
      return Promise.resolve({ totalHits: hits, resetTime: new Date(Date.now() + 60000) });
    }
    decrement(key: string) {
      const id = this.prefix + key;
      counters.set(id, (counters.get(id) ?? 1) - 1);
      return Promise.resolve();
    }
    resetKey(key: string) {
      counters.delete(this.prefix + key);
      return Promise.resolve();
    }
  },
}));
beforeEach(() => counters.clear());
describe("compteurs Redis des limites de débit", () => {
  it("ne compte pas la navigation du dashboard comme tentatives de connexion", async () => {
    const app = express();
    app.use(buildRateLimiter({ windowMs: 60000, limit: 50 }));
    app.get("/browse", (_req, res) => res.sendStatus(200));
    app.get("/login", buildRateLimiter({ windowMs: 60000, limit: 2 }), (_req, res) => res.sendStatus(200));
    for (let i = 0; i < 3; i++) expect((await request(app).get("/browse")).status).toBe(200);
    expect((await request(app).get("/login")).status).toBe(200);
    expect((await request(app).get("/login")).status).toBe(200);
    expect((await request(app).get("/login")).status).toBe(429);
  });
  it("garde le compteur partagé entre deux instances de la même politique", async () => {
    function instance() {
      const app = express();
      app.use(buildRateLimiter({ windowMs: 60000, limit: 2 }));
      app.get("/login", (_req, res) => res.sendStatus(200));
      return app;
    }
    const first = instance(),
      second = instance();
    expect((await request(first).get("/login")).status).toBe(200);
    expect((await request(second).get("/login")).status).toBe(200);
    expect((await request(first).get("/login")).status).toBe(429);
  });
});
