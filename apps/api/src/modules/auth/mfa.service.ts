import type { User } from "@prisma/client";

import { decrypt, encrypt } from "../../lib/encryption.js";
import { AppError } from "../../lib/errors.js";
import {
  buildOtpAuthUri,
  generateMfaRecoveryCodes,
  generateMfaSecret,
  hashMfaRecoveryCode,
  verifyTotpCode,
} from "../../lib/mfa.js";
import { verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";

export interface MfaSetupResult {
  secret: string;
  otpauthUri: string;
}

async function requireUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", `User not found: ${userId}`);
  }
  return user;
}

/**
 * §34 : `mfaEnabled` ne bascule pas ici — seul `enableMfa`, après vérification d'un
 * premier code, active réellement le second facteur. Rappelable pour régénérer un
 * secret pendant la mise en place (avant confirmation), mais refusé si MFA est déjà
 * actif — passer par `disableMfa` d'abord pour reconfigurer.
 */
export async function setupMfa(userId: string, email: string): Promise<MfaSetupResult> {
  const user = await requireUser(userId);
  if (user.mfaEnabled) {
    throw new AppError(
      409,
      "MFA_ALREADY_ENABLED",
      "MFA is already enabled — disable it first to reconfigure",
    );
  }

  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretCiphertext: encrypt(secret) } });

  return { secret, otpauthUri: buildOtpAuthUri(email, secret) };
}

export async function enableMfa(userId: string, code: string): Promise<string[]> {
  const user = await requireUser(userId);
  if (user.mfaEnabled) {
    throw new AppError(409, "MFA_ALREADY_ENABLED", "MFA is already enabled");
  }
  if (!user.mfaSecretCiphertext) {
    throw new AppError(409, "MFA_SETUP_REQUIRED", "Call setup before enabling MFA");
  }

  const valid = await verifyTotpCode(decrypt(user.mfaSecretCiphertext), code);
  if (!valid) {
    throw new AppError(401, "INVALID_MFA_CODE", "Incorrect authentication code");
  }

  const { codes, hashes } = generateMfaRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
  ]);

  return codes;
}

export async function disableMfa(userId: string, password: string, code: string): Promise<void> {
  const user = await requireUser(userId);
  if (!user.mfaEnabled || !user.mfaSecretCiphertext) {
    throw new AppError(409, "MFA_NOT_ENABLED", "MFA is not enabled on this account");
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid password");
  }

  const validTotp = await verifyTotpCode(decrypt(user.mfaSecretCiphertext), code);
  const validRecovery = validTotp ? false : await consumeMfaRecoveryCode(userId, code);
  if (!validTotp && !validRecovery) {
    throw new AppError(401, "INVALID_MFA_CODE", "Incorrect authentication code");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretCiphertext: null } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/**
 * Partagé avec `auth.service.ts` (login post-MFA) — un code de secours accepté à la
 * place d'un TOTP. `updateMany` guardé par `usedAt: null` plutôt qu'un
 * `findFirst`+`update` séparés (même motif que `activationCode` ci-dessus) : deux
 * requêtes concurrentes présentant le même code passeraient toutes les deux le
 * `findFirst` avant que l'une ou l'autre ne pose `usedAt`, authentifiant deux sessions
 * avec un code censé être à usage unique.
 */
export async function consumeMfaRecoveryCode(userId: string, code: string): Promise<boolean> {
  const codeHash = hashMfaRecoveryCode(code);
  const claim = await prisma.mfaRecoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claim.count > 0;
}
