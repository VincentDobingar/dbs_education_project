import { baseEnvSchema, loadEnv } from "@edumanage/config";
import { z } from "zod";

const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env: ApiEnv = loadEnv(apiEnvSchema);
