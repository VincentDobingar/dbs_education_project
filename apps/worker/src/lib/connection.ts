import { env } from "../env.js";

/** Shared BullMQ/Redis connection options, parsed once from REDIS_URL. */
export function getRedisConnectionOptions(): { host: string; port: number; password?: string } {
  const url = new URL(env.REDIS_URL);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: url.password } : {}),
  };
}
