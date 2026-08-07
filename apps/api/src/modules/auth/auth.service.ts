import type { User } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { signAccessToken } from "../../lib/jwt.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_TTL_MS } from "../../lib/refresh-token.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      // TODO(Phase 3): require email verification (§34) before granting ACTIVE status.
      status: "ACTIVE",
      profile: { create: { firstName: input.firstName, lastName: input.lastName } },
    },
  });
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

export async function login(email: string, password: string, meta: SessionMeta): Promise<AuthTokens> {
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
