import type { User } from "@prisma/client";

import {
  EMAIL_VERIFICATION_TTL_MS,
  generateEmailVerificationToken,
  generatePhoneVerificationCode,
  hashEmailVerificationToken,
  hashPhoneVerificationCode,
  PHONE_VERIFICATION_TTL_MS,
} from "../../lib/account-verification.js";
import { decrypt } from "../../lib/encryption.js";
import { AppError } from "../../lib/errors.js";
import { signAccessToken, signMfaChallengeToken, verifyMfaChallengeToken } from "../../lib/jwt.js";
import { verifyTotpCode } from "../../lib/mfa.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_TTL_MS } from "../../lib/refresh-token.js";

import { consumeMfaRecoveryCode } from "./mfa.service.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResult = AuthTokens | MfaChallenge;

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | undefined;
}

export interface RegisterResult {
  user: User;
  emailVerificationToken: string;
  phoneVerificationCode?: string;
}

/**
 * §34 : le compte reste PENDING tant que l'email (ou le téléphone, si renseigné — §15
 * accepte l'un ou l'autre) n'est pas vérifié ; `login` refuse déjà tout statut différent
 * d'ACTIVE. Aucun fournisseur email/SMS réel n'existe dans ce code (même limite que
 * Mobile Money §24 et les codes d'activation §8) : le jeton/code est donc renvoyé en
 * clair une seule fois dans la réponse d'inscription, documenté plutôt que simulé
 * silencieusement — l'appelant (ou un futur relais staff) le transmet manuellement.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists");
  }

  if (input.phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (existingPhone) {
      throw new AppError(409, "PHONE_ALREADY_REGISTERED", "An account with this phone already exists");
    }
  }

  const passwordHash = await hashPassword(input.password);
  const { token: emailVerificationToken, hash: emailVerificationTokenHash } =
    generateEmailVerificationToken();
  const phoneVerificationCode = input.phone ? generatePhoneVerificationCode() : undefined;

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      ...(input.phone ? { phone: input.phone } : {}),
      emailVerificationTokenHash,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      ...(phoneVerificationCode
        ? {
            phoneVerificationCodeHash: hashPhoneVerificationCode(input.email, phoneVerificationCode),
            phoneVerificationExpiresAt: new Date(Date.now() + PHONE_VERIFICATION_TTL_MS),
          }
        : {}),
      profile: { create: { firstName: input.firstName, lastName: input.lastName } },
    },
  });

  return { user, emailVerificationToken, ...(phoneVerificationCode ? { phoneVerificationCode } : {}) };
}

export async function verifyEmail(token: string): Promise<User> {
  const tokenHash = hashEmailVerificationToken(token);
  const user = await prisma.user.findUnique({ where: { emailVerificationTokenHash: tokenHash } });
  if (!user) {
    throw new AppError(404, "VERIFICATION_TOKEN_NOT_FOUND", "Invalid or already used verification token");
  }
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    throw new AppError(410, "VERIFICATION_TOKEN_EXPIRED", "Verification token has expired");
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
      ...(user.status === "PENDING" ? { status: "ACTIVE" } : {}),
    },
  });
}

export async function verifyPhone(email: string, code: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.phoneVerificationCodeHash) {
    throw new AppError(404, "VERIFICATION_CODE_NOT_FOUND", "No pending phone verification for this account");
  }
  if (!user.phoneVerificationExpiresAt || user.phoneVerificationExpiresAt < new Date()) {
    throw new AppError(410, "VERIFICATION_CODE_EXPIRED", "Verification code has expired");
  }
  if (hashPhoneVerificationCode(email, code) !== user.phoneVerificationCodeHash) {
    throw new AppError(401, "INVALID_VERIFICATION_CODE", "Incorrect verification code");
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerifiedAt: new Date(),
      phoneVerificationCodeHash: null,
      phoneVerificationExpiresAt: null,
      ...(user.status === "PENDING" ? { status: "ACTIVE" } : {}),
    },
  });
}

export async function resendEmailVerification(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", `No account with email: ${email}`);
  }
  if (user.emailVerifiedAt) {
    throw new AppError(409, "EMAIL_ALREADY_VERIFIED", "This email is already verified");
  }

  const { token, hash } = generateEmailVerificationToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationTokenHash: hash,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });
  return token;
}

export async function resendPhoneVerification(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", `No account with email: ${email}`);
  }
  if (!user.phone) {
    throw new AppError(400, "PHONE_NOT_SET", "This account has no phone number on file");
  }
  if (user.phoneVerifiedAt) {
    throw new AppError(409, "PHONE_ALREADY_VERIFIED", "This phone number is already verified");
  }

  const code = generatePhoneVerificationCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerificationCodeHash: hashPhoneVerificationCode(email, code),
      phoneVerificationExpiresAt: new Date(Date.now() + PHONE_VERIFICATION_TTL_MS),
    },
  });
  return code;
}

async function createSession(userId: string, meta: SessionMeta): Promise<AuthTokens> {
  const { token, hash } = generateRefreshToken();

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hash,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return { accessToken: signAccessToken({ sub: userId }), refreshToken: token };
}

export async function login(email: string, password: string, meta: SessionMeta): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, "ACCOUNT_LOCKED", "Too many failed attempts, try again later");
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(403, "ACCOUNT_NOT_ACTIVE", "Account is not active");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // §34 : mot de passe correct mais un second facteur reste à vérifier — pas de session
  // tant que verifyMfaChallenge n'a pas validé un code TOTP ou de secours.
  if (user.mfaEnabled) {
    return { mfaRequired: true, challengeToken: signMfaChallengeToken(user.id) };
  }

  return createSession(user.id, meta);
}

export async function verifyMfaChallenge(
  challengeToken: string,
  code: string,
  meta: SessionMeta,
): Promise<AuthTokens> {
  let userId: string;
  try {
    userId = verifyMfaChallengeToken(challengeToken).sub;
  } catch {
    throw new AppError(401, "INVALID_MFA_CHALLENGE", "Invalid or expired MFA challenge");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecretCiphertext) {
    throw new AppError(401, "INVALID_MFA_CHALLENGE", "Invalid or expired MFA challenge");
  }

  const validTotp = await verifyTotpCode(decrypt(user.mfaSecretCiphertext), code);
  const validRecovery = validTotp ? false : await consumeMfaRecoveryCode(user.id, code);
  if (!validTotp && !validRecovery) {
    throw new AppError(401, "INVALID_MFA_CODE", "Incorrect authentication code");
  }

  return createSession(user.id, meta);
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const hash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  // Rotation (§34): the used token is revoked immediately, a brand new one is issued.
  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), revokedReason: "ROTATED" },
  });

  return createSession(session.userId, {
    ...(session.userAgent ? { userAgent: session.userAgent } : {}),
    ...(session.ipAddress ? { ipAddress: session.ipAddress } : {}),
  });
}

export async function logout(refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);

  await prisma.session.updateMany({
    where: { refreshTokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
  });
}
