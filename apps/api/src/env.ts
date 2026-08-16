import { baseEnvSchema, loadEnv } from "@edumanage/config";
import { z } from "zod";

const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // AES-256 : 32 octets, encodés hex (openssl rand -hex 32). Chiffre le secret TOTP
  // MFA (§34) — la seule donnée de ce code qui doit rester réversible.
  MFA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "must be 64 hex characters (32 bytes)"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env: ApiEnv = loadEnv(apiEnvSchema);
