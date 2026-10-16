import jwt from "jsonwebtoken";

import { env } from "../env.js";

export interface AccessTokenPayload {
  sub: string; // User.id
}

const ACCESS_TOKEN_TTL = "15m";
const MFA_CHALLENGE_TOKEN_TTL = "5m";
const MFA_CHALLENGE_TYPE = "mfa_challenge";
const MFA_ENROLLMENT_TOKEN_TTL = "15m";
const MFA_ENROLLMENT_TYPE = "mfa_enrollment_required";

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/**
 * §34 : email+mot de passe corrects mais le compte a MFA actif — ce jeton court prouve
 * cette étape intermédiaire sans jamais valoir un accès complet. `typ` distingue le
 * payload d'un access token normal, et `verifyAccessToken` le rejette explicitement
 * pour qu'un jeton de défi ne puisse jamais être rejoué comme accès complet.
 */
export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: MFA_CHALLENGE_TYPE }, env.JWT_ACCESS_SECRET, {
    expiresIn: MFA_CHALLENGE_TOKEN_TTL,
  });
}

export function verifyMfaChallengeToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string" || typeof decoded.sub !== "string" || decoded.typ !== MFA_CHALLENGE_TYPE) {
    throw new Error("Invalid MFA challenge token payload");
  }

  return { sub: decoded.sub };
}

/**
 * MFA obligatoire pour rôles sensibles : mot de passe correct, le compte détient un
 * rôle sensible (authorization.ts, SENSITIVE_ROLE_CODES) mais n'a pas encore activé
 * le MFA — ce jeton ne permet rien d'autre que d'appeler /mfa/setup puis /mfa/enable
 * (requireAuthOrMfaEnrollment), jamais une route ordinaire derrière requireAuth,
 * même garde par `typ` que le jeton de défi MFA ci-dessus.
 */
export function signMfaEnrollmentToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: MFA_ENROLLMENT_TYPE }, env.JWT_ACCESS_SECRET, {
    expiresIn: MFA_ENROLLMENT_TOKEN_TTL,
  });
}

export function verifyMfaEnrollmentToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string" || typeof decoded.sub !== "string" || decoded.typ !== MFA_ENROLLMENT_TYPE) {
    throw new Error("Invalid MFA enrollment token payload");
  }

  return { sub: decoded.sub };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded === "string" || typeof decoded.sub !== "string" || "typ" in decoded) {
    throw new Error("Invalid access token payload");
  }

  return { sub: decoded.sub };
}
