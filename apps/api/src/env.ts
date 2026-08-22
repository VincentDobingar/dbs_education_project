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

  // §28 : canaux de notification réels — tous optionnels, seule config
  // non-obligatoire de ce fichier. Absents en dev/test tant qu'aucun fournisseur
  // n'est configuré (voir lib/notification-channels.ts) : le comportement actuel
  // ("jeton/code renvoyé dans la réponse") reste inchangé jusqu'à ce qu'ils soient
  // renseignés — jamais un boot qui échoue faute de ces identifiants.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_ADDRESS: z.string().email().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env: ApiEnv = loadEnv(apiEnvSchema);
