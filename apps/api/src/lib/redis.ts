import { Redis } from "ioredis";

import { env } from "../env.js";

import { logger } from "./logger.js";

let client: Redis | undefined;

/**
 * Client Redis partagé, créé paresseusement au premier usage réel plutôt qu'à
 * l'import du module — évite d'ouvrir une connexion Redis dans chacun des
 * fichiers de test d'intégration qui importent app.ts (donc ce module via
 * rateLimit.ts), alors que le rate-limiter y est toujours court-circuité
 * (`NODE_ENV=test`, voir rateLimit.ts).
 */
export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
    client.on("error", (err) => {
      logger.error({ err }, "Redis connection error");
    });
  }
  return client;
}
