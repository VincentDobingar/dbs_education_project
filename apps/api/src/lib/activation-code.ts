import { createHash, randomInt } from "node:crypto";

const ACTIVATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const ACTIVATION_CODE_LENGTH = 10;
export const ACTIVATION_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Unlike refresh tokens (opaque, 48 random bytes), this code is meant to be typed by
 * a human beneficiary (§8) — short, unambiguous alphabet, still opaque and hashed
 * the same way (SHA-256, plaintext handed out once, only the hash persisted).
 */
export function generateActivationCode(): { code: string; hash: string } {
  const code = Array.from(
    { length: ACTIVATION_CODE_LENGTH },
    () => ACTIVATION_CODE_ALPHABET[randomInt(ACTIVATION_CODE_ALPHABET.length)],
  ).join("");
  return { code, hash: hashActivationCode(code) };
}

export function hashActivationCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}
