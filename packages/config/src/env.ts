import { z } from "zod";

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Parses process.env against the given schema and exits with a readable
 * error instead of letting the app boot with missing/invalid configuration.
 */
/**
 * An env var left blank in a `.env` file (e.g. `SMTP_PORT=`) is read by dotenv
 * as an empty string, not as an absent key — so `.optional()` fields with an
 * extra format check (`.email()`, `.coerce.number().min(1)`, ...) fail on it
 * instead of being skipped. Stripping empty-string values before validation
 * makes "leave it blank to disable" actually work for every optional field,
 * matching what every `.env.example` in this repo documents.
 */
function withoutBlankValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
}

export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(withoutBlankValues(source));

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return result.data as z.infer<T>;
}
