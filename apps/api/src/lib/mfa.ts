import { createHash, randomInt } from "node:crypto";

import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "EduManage Africa";
const TOTP_EPOCH_TOLERANCE: [number, number] = [1, 1]; // ±30s de tolérance d'horloge

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // pas de 0/O, 1/I
const RECOVERY_CODE_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 8;

/** Secret TOTP, encodé Base32 pour compatibilité Google/Microsoft Authenticator etc. (§34). */
export function generateMfaSecret(): string {
  return generateSecret();
}

export function buildOtpAuthUri(accountEmail: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: accountEmail, secret });
}

/**
 * otplib rejette (throw) tout jeton qui n'a pas exactement 6 chiffres plutôt que de le
 * traiter comme simplement invalide — un code de secours (10 caractères alphanumériques,
 * voir plus bas) passé ici par erreur planterait sinon la requête au lieu d'échouer
 * proprement. Le format est donc vérifié avant d'appeler otplib.
 */
export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) {
    return false;
  }
  const result = await verify({ secret, token, epochTolerance: TOTP_EPOCH_TOLERANCE });
  return result.valid;
}

/**
 * Générés une fois à l'activation (`enableMfa`), hachés (jamais en clair), à usage
 * unique — même trempe que `activation-code.ts` (§8) : alphabet non ambigu, tapable à
 * la main, mais un secret différent par domaine plutôt qu'un utilitaire générique
 * partagé entre §8 et §34.
 */
export function generateMfaRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    Array.from(
      { length: RECOVERY_CODE_LENGTH },
      () => RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)],
    ).join(""),
  );
  return { codes, hashes: codes.map(hashMfaRecoveryCode) };
}

export function hashMfaRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}
