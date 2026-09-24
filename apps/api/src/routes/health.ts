import { Router } from "express";

import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { rawPrisma } from "../lib/prisma.js";
import { getRedisClient } from "../lib/redis.js";

type DependencyStatus = "ok" | "down" | "skipped";

async function checkPostgres(): Promise<DependencyStatus> {
  try {
    await rawPrisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch (err) {
    logger.error({ err }, "Health check: Postgres unreachable");
    return "down";
  }
}

/**
 * Pas de connexion Redis provisionnée en test (voir lib/redis.ts, création
 * paresseuse, et rateLimit.ts's skipInTest — aucune suite n'en a jamais eu
 * besoin) : un vrai ping y échouerait systématiquement sans rien révéler d'un
 * bug réel, donc on ne le tente pas et on le rapporte tel quel.
 */
async function checkRedis(): Promise<DependencyStatus> {
  if (env.NODE_ENV === "test") return "skipped";

  try {
    await getRedisClient().ping();
    return "ok";
  } catch (err) {
    logger.error({ err }, "Health check: Redis unreachable");
    return "down";
  }
}

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_req, res) => {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);
  const healthy = postgres === "ok" && redis !== "down";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: { postgres, redis },
  });
});
