import { baseEnvSchema, loadEnv } from "@edumanage/config";
import { z } from "zod";

const apiEnvSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Origine du site web, pour les liens envoyés par e-mail (réinitialisation du mot
  // de passe). Par défaut CORS_ORIGIN, qui est déjà l'origine unique du frontend.
  WEB_APP_URL: z.string().url().optional(),
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
  // "true"/"false" explicites : z.coerce.boolean() lisait "false" comme true
  // (toute chaîne non vide), ce qui forçait TLS direct sur le port 587 (STARTTLS).
  // Une valeur vide (SMTP_SECURE= dans un .env) reste « non renseignée ».
  SMTP_SECURE: z
    .preprocess((value) => (value === "" ? undefined : value), z.enum(["true", "false"]).optional())
    .transform((value) => (value === undefined ? undefined : value === "true")),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_ADDRESS: z.string().email().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Logo d'établissement téléversé (multipart) plutôt qu'une URL déjà hébergée
  // (lib/file-storage.ts) : stockage disque local, servi statiquement sous
  // /uploads. PUBLIC_API_URL doit pointer vers l'origine publique réellement
  // atteignable de cette API (jamais localhost en production) — c'est ce qui
  // permet à lib/safe-image-fetch.ts de récupérer le fichier pour l'embarquer
  // dans un PDF (HTTPS uniquement, IP privées refusées, voir cette lib).
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  UPLOAD_DIR: z.string().min(1).default("storage"),

  // Nombre de reverse proxies de confiance devant l'API (1 = Traefik/Coolify).
  // Sans cela `req.ip` vaut l'IP du proxy : le rate limiting (§34) placerait tous
  // les utilisateurs dans le même compteur et `ipAddress` des journaux d'audit
  // serait faux. 0 (défaut) = aucun proxy, comportement inchangé en dev/test.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // §34 : MFA obligatoire pour les rôles sensibles (authorization.ts). "false" le
  // rend facultatif : un compte sensible sans MFA reçoit directement une session,
  // un compte qui a activé le MFA garde son défi. Chaîne explicite plutôt que
  // z.coerce.boolean (qui lirait "false" comme vrai). Activé par défaut.
  MFA_REQUIRED_FOR_SENSITIVE_ROLES: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const env: ApiEnv = loadEnv(apiEnvSchema);
