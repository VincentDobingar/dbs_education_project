import { createHash, randomBytes } from "node:crypto";

const REFRESH_TOKEN_BYTES = 48;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/**
 * Refresh tokens are opaque random strings, never JWTs: the plaintext is handed to
 * the client once, only its SHA-256 hash is persisted (Session.refreshTokenHash),
 * and revocation is a simple row update — no signature/expiry logic to get wrong.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
