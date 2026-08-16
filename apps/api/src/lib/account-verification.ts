import { createHash, randomBytes, randomInt } from "node:crypto";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures
export const PHONE_VERIFICATION_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Jeton "lien de vérification" (§34) : opaque, haute entropie, comparé par égalité de
 * hash — même traitement que les refresh tokens (lib/refresh-token.ts), jamais stocké
 * en clair.
 */
export function generateEmailVerificationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEmailVerificationToken(token) };
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Code "SMS" à 6 chiffres (§34) — trop court pour être haché seul (10^6 possibilités,
 * collision quasi certaine entre deux comptes) : l'email sert de sel (déjà l'identifiant
 * fourni à `POST /verify-phone` avec le code, pas besoin d'un id utilisateur généré
 * après coup — utilisable dès l'inscription, avant que l'utilisateur existe en base).
 */
export function generatePhoneVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPhoneVerificationCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}
