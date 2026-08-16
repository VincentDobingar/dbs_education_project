import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommandé pour GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.MFA_ENCRYPTION_KEY, "hex");
}

/**
 * AES-256-GCM — la seule donnée de ce code qui doit rester réversible (un secret TOTP
 * doit pouvoir être relu pour vérifier un code, contrairement aux mots de passe/jetons
 * hachés ailleurs dans lib/, §34). IV aléatoire par appel, préfixé au ciphertext avec
 * le tag d'authentification : un seul champ texte à persister, pas de colonne séparée.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
